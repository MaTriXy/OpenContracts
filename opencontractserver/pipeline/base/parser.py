import json
import logging
from abc import ABC, abstractmethod
from typing import Optional

from django.conf import settings
from django.core.files.base import ContentFile
from plasmapdf.models.PdfDataLayer import makePdfTranslationLayerFromPawlsTokens

from opencontractserver.annotations.models import RELATIONSHIP_LABEL
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.types.dicts import OpenContractDocExport
from opencontractserver.utils.importing import (
    import_annotations,
    import_relationships,
    load_or_create_labels,
)

logger = logging.getLogger(__name__)


class BaseParser(ABC):
    """
    Abstract base parser class. Parsers should inherit from this class.
    """

    title: str = ""
    description: str = ""
    author: str = ""
    dependencies: list[str] = []
    supported_file_types: list[FileTypeEnum] = []

    @abstractmethod
    def parse_document(
        self, user_id: int, doc_id: int, **kwargs
    ) -> Optional[OpenContractDocExport]:
        """
        Abstract method to parse a document.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to parse.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        pass

    def save_parsed_data(
        self,
        user_id: int,
        doc_id: int,
        open_contracts_data: OpenContractDocExport,
        corpus_id: Optional[int] = None,
        annotation_type: Optional[str] = None,
    ) -> None:
        """
        Saves the parsed data (both annotations and relationships) to the Document model.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document.
            open_contracts_data (OpenContractDocExport): The parsed document data, including:
                - labelled_text (List[OpenContractsAnnotationPythonType]):
                  Annotation list to be imported.
                - relationships (Optional[List[OpenContractsRelationshipPythonType]]):
                  Relationship list to be imported.
                - page_count, pawls_file_content, content, etc.
            corpus_id (Optional[int]): ID of the corpus, if the document should be associated with one.
            annotation_type (Optional[str]): The fallback annotation_type (e.g., SPAN_LABEL or TOKEN_LABEL).
                If the annotation data doesn't specify an annotation_type, this one is used.
        """
        logger = logging.getLogger(__name__)
        logger.info(f"Saving parsed data for doc {doc_id}")

        document = Document.objects.get(pk=doc_id)

        # Associate with corpus if provided
        if corpus_id:
            corpus_obj = Corpus.objects.get(id=corpus_id)
            corpus_obj.documents.add(document)
            corpus_obj.save()
            logger.info(f"Associated document with corpus: {corpus_obj.title}")
        else:
            corpus_obj = None

        # Save content to txt_extract_file
        txt_content = open_contracts_data.get("content", "")
        txt_file = ContentFile(txt_content.encode("utf-8"))
        document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)

        # Handle PAWLS content if any
        pawls_file_content = open_contracts_data.get("pawls_file_content")
        if pawls_file_content:
            pawls_string = json.dumps(pawls_file_content)
            pawls_file = ContentFile(pawls_string.encode("utf-8"))
            document.pawls_parse_file.save(f"doc_{doc_id}.pawls", pawls_file)

            # Create text layer from PAWLS tokens
            span_translation_layer = makePdfTranslationLayerFromPawlsTokens(
                json.loads(pawls_string)
            )
            # Optionally overwrite txt_extract_file with text from PAWLS
            txt_file = ContentFile(span_translation_layer.doc_text.encode("utf-8"))
            document.txt_extract_file.save(f"doc_{doc_id}.txt", txt_file)
            document.page_count = len(pawls_file_content)
        else:
            # Handle cases without PAWLS content
            document.page_count = open_contracts_data.get("page_count", 1)

        document.save()

        # Determine fallback label type (for annotations) if annotation types aren't specified in data
        logger.info(
            f"Loading or creating labels for document {doc_id} with file type {document.file_type}"
        )

        if annotation_type is not None:
            target_label_type = annotation_type
        else:
            target_label_type = settings.ANNOTATION_LABELS.get(
                document.file_type, "SPAN_LABEL"
            )

        logger.info(f"Target label type for textual annotations: {target_label_type}")

        # 1) Build a data dict for text annotation labels
        text_labels_data_dict = {
            label_data["annotationLabel"]: {
                "label_type": target_label_type,
                "color": "grey",
                "description": "Parser Structural Label",
                "icon": "expand",
                "text": label_data["annotationLabel"],
                "creator_id": user_id,
                "read_only": True,
            }
            for label_data in open_contracts_data.get("labelled_text", [])
        }

        logger.info(f"Text label data dict: {text_labels_data_dict}")

        # 2) Create or load text labels
        existing_text_labels = load_or_create_labels(
            user_id=user_id,
            labelset_obj=None,  # No labelset in this context
            label_data_dict=text_labels_data_dict,
            existing_labels={},
        )

        logger.info(f"Existing text label lookup: {existing_text_labels}")

        # 3) Import annotations & store mapping of old annotation IDs to new DB IDs
        annotation_id_map = import_annotations(
            user_id=user_id,
            doc_obj=document,
            corpus_obj=corpus_obj,
            annotations_data=open_contracts_data.get("labelled_text", []),
            label_lookup=existing_text_labels,
            label_type=target_label_type,
        )

        # 4) If there are relationships, load/create relationship labels and then import
        relationship_data = open_contracts_data.get("relationships", [])
        if relationship_data:
            # Build label data dict for relationship labels
            relationship_label_texts = {
                rel["relationshipLabel"] for rel in relationship_data
            }
            relationship_label_data_dict = {
                label_text: {
                    "label_type": RELATIONSHIP_LABEL,  # Distinct from text annotation type
                    "color": "gray",
                    "description": "Parser Relationship Label",
                    "icon": "share-alt",
                    "text": label_text,
                    "creator_id": user_id,
                    "read_only": True,
                }
                for label_text in relationship_label_texts
            }

            existing_relationship_labels = load_or_create_labels(
                user_id=user_id,
                labelset_obj=None,  # No labelset in this context
                label_data_dict=relationship_label_data_dict,
                existing_labels={},
            )

            # Now import relationships
            import_relationships(
                user_id=user_id,
                doc_obj=document,
                corpus_obj=corpus_obj,
                relationships_data=relationship_data,
                label_lookup=existing_relationship_labels,
                annotation_id_map=annotation_id_map,
            )

        logger.info(
            f"Document {doc_id} parsed (with annotations & relationships) and saved successfully."
        )

    def process_document(
        self, user_id: int, doc_id: int
    ) -> Optional[OpenContractDocExport]:
        """
        Process a document by parsing it and saving the parsed data.
        This method combines parse_document and save_parsed_data into a single operation.

        Args:
            user_id (int): ID of the user.
            doc_id (int): ID of the document to process.

        Returns:
            Optional[OpenContractDocExport]: The parsed document data, or None if parsing failed.
        """
        logger.info(f"Processing document {doc_id}")

        parsed_data = self.parse_document(user_id, doc_id)

        if parsed_data is not None:
            self.save_parsed_data(user_id, doc_id, parsed_data)
            logger.info(f"Document {doc_id} processed successfully")
        else:
            logger.warning(f"Document {doc_id} parsing failed")

        return parsed_data
