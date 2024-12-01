import { useEffect, useMemo, useState } from "react";
import {
  Tab,
  Card,
  Segment,
  Popup,
  Header,
  Icon,
  Placeholder,
  SemanticShorthandItem,
  TabPaneProps,
  TabProps,
  StatisticGroup,
  Statistic,
  StatisticValue,
  StatisticLabel,
} from "semantic-ui-react";

import _, { isNumber } from "lodash";
import { HighlightItem } from "./HighlightItem";
import { RelationItem } from "./RelationItem";

import "./AnnotatorSidebar.css";
import { useReactiveVar } from "@apollo/client";
import {
  openedCorpus,
  showStructuralAnnotations,
} from "../../../graphql/cache";
import {
  AnalysisType,
  ColumnType,
  CorpusType,
  DatacellType,
  ExtractType,
} from "../../../types/graphql-api";
import { SearchSidebarWidget } from "../search_widget/SearchSidebarWidget";
import { FetchMoreOnVisible } from "../../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { SingleDocumentExtractResults } from "../../extracts/SingleDocumentExtractResults";
import { PermissionTypes } from "../../types";
import { getPermissions } from "../../../utils/transform";
import { PlaceholderCard } from "../../placeholders/PlaceholderCard";
import { CorpusStats } from "../../widgets/data-display/CorpusStatus";
import styled from "styled-components";
import { RelationGroup } from "../types/annotations";
import { useAnnotationSearch } from "../hooks/useAnnotationSearch";
import { useAnnotationRefs } from "../hooks/useAnnotationRefs";
import { useUISettings } from "../hooks/useUISettings";
import {
  useAnnotationControls,
  useAnnotationSelection,
} from "../context/UISettingsAtom";
import { useAnalysisManager } from "../hooks/AnalysisHooks";
import {
  useDeleteAnnotation,
  usePdfAnnotations,
  useRemoveAnnotationFromRelationship,
  useRemoveRelationship,
} from "../hooks/AnnotationHooks";
import { ViewSettingsPopup } from "../../widgets/popups/ViewSettingsPopup";
import { LabelDisplayBehavior } from "../../../types/graphql-api";

interface TabPanelProps {
  pane?: SemanticShorthandItem<TabPaneProps>;
  menuItem?: any;
  render?: () => React.ReactNode;
}

const getHeaderInfo = (
  edit_mode: "ANNOTATE" | "ANALYZE",
  allow_input: boolean,
  read_only: boolean
) => {
  let header_text = "";
  let subheader_text = "";
  let tooltip_text = "";

  if (edit_mode === "ANALYZE") {
    header_text = "Analyses";
    subheader_text = "Machine-created annotations.";

    if (allow_input && !read_only) {
      header_text += " (Feedback Mode)";
      subheader_text += " You can provide feedback on these annotations.";
      tooltip_text =
        "In feedback mode, you can approve, reject, or suggest changes to machine-generated annotations.";
    } else {
      header_text += " (View Mode)";
      tooltip_text =
        "Check out Gremlin for more information on how to create or install NLP microservices that generate Open Contracts compatible annotations.";
    }
  } else {
    header_text = "Annotations";

    if (edit_mode === "ANNOTATE") {
      if (allow_input && !read_only) {
        header_text += " (Edit Mode)";
        subheader_text = "You can create, edit, and delete annotations.";
        tooltip_text =
          "To create a highlight, drag to select the desired text. The label selected in the 'Selected Label:' box below will be applied. SHIFT + click to select multiple, separate regions.";
      } else {
        header_text += " (View Mode)";
        subheader_text =
          "You are viewing pre-existing annotations. Editing is currently disabled.";
        tooltip_text = "Switch to Edit Mode to make changes to annotations.";
      }
    } else {
      header_text += " (View Mode)";
      subheader_text = "You are viewing human-created annotations.";
      tooltip_text =
        "Switch to Human Annotation Mode and then to Edit Mode to make changes to annotations.";
    }
  }

  if (read_only) {
    subheader_text += " You do not have edit permissions for this corpus.";
    tooltip_text =
      "The annotator is in read-only mode. You can view annotations but can't edit or create new ones. If this is unexpected, check your permissions or whether you've selected machine-created analyses.";
  }

  return { header_text, subheader_text, tooltip_text };
};

const SidebarContainer = styled.div<{ width: string }>`
  width: ${(props) => props.width};
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
  z-index: 10;
`;

const TopSection = styled.div`
  background: #ffffff;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

const TitleGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const StatsRow = styled(StatisticGroup)`
  &&& {
    width: 100%;
    margin: 0;
    display: flex;
    justify-content: space-between;
    padding-top: 1rem;
    border-top: 1px solid #f1f5f9;

    .statistic {
      margin: 0 !important;

      .value {
        font-size: 0.875rem !important;
        color: #1a2027 !important;
        margin-bottom: 0.25rem;
      }

      .label {
        font-size: 0.75rem;
        color: #64748b;
        text-transform: none;
      }
    }
  }
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #1a2027;
`;

const ModeBadge = styled.span<{ mode: "edit" | "view" | "feedback" }>`
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 1rem;
  gap: 0.375rem;
  flex: 1;

  ${(props) => {
    switch (props.mode) {
      case "edit":
        return `
          color: #0d9488;
          background: #f0fdfa;
          border: 1px solid #ccfbf1;
        `;
      case "feedback":
        return `
          color: #9333ea;
          background: #faf5ff;
          border: 1px solid #f3e8ff;
        `;
      default:
        return `
          color: #64748b;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
        `;
    }
  }}
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled(Popup)`
  &&& {
    button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: white;
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s ease;
      padding: 0;

      &:hover {
        background: #f8fafc;
        color: #2563eb;
        border-color: #2563eb;
      }

      &[data-active="true"] {
        background: #eff6ff;
        color: #2563eb;
        border-color: #2563eb;
      }
    }
  }
`;

const StyledTab = styled(Tab)`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: hidden;

  .ui.secondary.menu {
    justify-content: center;
    padding: 0;
    padding-top: 1rem;
    margin: 0;
    border-bottom: 1px solid #e0e0e0;
  }

  .item {
    flex: 1;
    justify-content: center;
    color: #34495e;
    font-weight: 600;
    border-bottom: 2px solid transparent;

    &.active {
      color: #2185d0;
      border-color: #2185d0;
    }
  }

  .ui.segment {
    flex: 1;
    overflow-y: auto;
    border: none;
    border-radius: 0;
    margin: 0;
    padding: 1rem;
  }
`;

const ContentContainer = styled.div`
  height: 100%;
  overflow-y: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
`;

export const AnnotatorSidebar = ({
  read_only,
  selected_corpus,
  selected_analysis,
  selected_extract,
  allowInput,
  editMode,
  datacells,
  columns,
  setEditMode,
  setAllowInput,
  fetchMore,
}: {
  read_only: boolean;
  selected_corpus?: CorpusType | null | undefined;
  selected_analysis?: AnalysisType | null | undefined;
  selected_extract?: ExtractType | null | undefined;
  editMode: "ANNOTATE" | "ANALYZE";
  allowInput: boolean;
  datacells: DatacellType[];
  columns: ColumnType[];
  setEditMode: (m: "ANNOTATE" | "ANALYZE") => void | undefined | null;
  setAllowInput: (v: boolean) => void | undefined | null;
  fetchMore?: () => void;
}) => {
  const handleRemoveRelationship = useRemoveRelationship();
  const handleDeleteAnnotation = useDeleteAnnotation();
  const removeAnnotationFromRelation = useRemoveAnnotationFromRelationship();

  const {
    selectedAnnotations,
    selectedRelations,
    setSelectedAnnotations,
    setSelectedRelations,
  } = useAnnotationSelection();
  const { isSidebarVisible, setSidebarVisible } = useUISettings();
  const opened_corpus = useReactiveVar(openedCorpus);
  const show_structural_annotations = useReactiveVar(showStructuralAnnotations);

  // Slightly kludgy way to handle responsive layout and drop sidebar once it becomes a pain
  // If there's enough interest to warrant a refactor, we can put some more thought into how
  // to handle the layout on a cellphone / small screen.
  const { width } = useWindowDimensions();
  const show_minimal_layout = width <= 1000;

  const { header_text, subheader_text, tooltip_text } = getHeaderInfo(
    selected_analysis || selected_extract ? "ANALYZE" : "ANNOTATE",
    allowInput,
    read_only ||
      (!selected_analysis && !selected_extract && !opened_corpus?.labelSet)
  );

  const [showCorpusStats, setShowCorpusStats] = useState(false);
  const [showSearchPane, setShowSearchPane] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [panes, setPanes] = useState<TabPanelProps[]>([]);

  useEffect(() => {
    console.log("Sidebar visibility state:", {
      isSidebarVisible,
      paneCount: panes.length,
      containerDimensions: {
        width: document.getElementById("AnnotatorSidebarContainer")
          ?.clientWidth,
        height: document.getElementById("AnnotatorSidebarContainer")
          ?.clientHeight,
      },
      parentDimensions: {
        width: document.getElementById("AnnotatorSidebarContainer")
          ?.parentElement?.clientWidth,
        height: document.getElementById("AnnotatorSidebarContainer")
          ?.parentElement?.clientHeight,
      },
      showMinimalLayout: show_minimal_layout,
      displayStyle: !isSidebarVisible || show_minimal_layout ? "none" : "flex",
    });
  }, [isSidebarVisible, panes, show_minimal_layout]);

  const handleTabChange = (
    event: React.MouseEvent<HTMLDivElement>,
    data: TabProps
  ) => {
    console.log("Should set active index to ", data.activeIndex);
    if (data?.activeIndex !== undefined) {
      if (isNumber(data.activeIndex)) {
        setActiveIndex(data.activeIndex);
      } else {
        setActiveIndex(parseInt(data.activeIndex));
      }
    }
  };

  const {} = useAnalysisManager();
  const { spanLabelsToView } = useAnnotationControls();
  const { searchResults } = useAnnotationSearch();
  const { annotationElementRefs } = useAnnotationRefs();
  const { pdfAnnotations } = usePdfAnnotations();
  const annotations = pdfAnnotations.annotations;
  const relations = pdfAnnotations.relations;

  const filteredAnnotations = useMemo(() => {
    let return_annotations = [...annotations];
    if (!show_structural_annotations) {
      return_annotations = return_annotations.filter(
        (annotation) => !annotation.structural
      );
    }

    if (!spanLabelsToView || spanLabelsToView.length === 0) {
      return return_annotations;
    }
    return return_annotations.filter((annotation) =>
      spanLabelsToView?.some(
        (label) => label.id === annotation.annotationLabel.id
      )
    );
  }, [annotations, spanLabelsToView, show_structural_annotations]);

  useEffect(() => {
    try {
      let corpus_permissions: PermissionTypes[] = [];
      let raw_corp_permissions = selected_corpus
        ? selected_corpus.myPermissions
        : ["READ"];
      if (selected_corpus && raw_corp_permissions !== undefined) {
        corpus_permissions = getPermissions(raw_corp_permissions);
      }

      let panes: TabPanelProps[] = [];

      // Show annotations IF we have annotations to display OR we can create them and have a valid labelSet
      const show_annotation_pane =
        !selected_extract &&
        (annotations.length > 0 ||
          (selected_corpus?.labelSet &&
            corpus_permissions.includes(PermissionTypes.CAN_UPDATE)));

      if (show_annotation_pane) {
        let text_highlight_elements = [<></>];
        if (filteredAnnotations && filteredAnnotations.length > 0) {
          text_highlight_elements = _.orderBy(
            filteredAnnotations,
            (annotation) => annotation.page
          ).map((annotation, index) => {
            return (
              <HighlightItem
                key={`highlight_item_${index}`}
                className={annotation.id}
                annotation={annotation}
                read_only={read_only}
                relations={relations}
                onDelete={onDeleteAnnotation}
                onSelect={toggleSelectedAnnotation}
              />
            );
          });
          text_highlight_elements.push(
            <FetchMoreOnVisible
              fetchNextPage={fetchMore ? () => fetchMore() : () => {}}
              fetchWithoutMotion
            />
          );
        } else {
          text_highlight_elements = [
            <PlaceholderCard
              style={{ flex: 1 }}
              title="No Matching Annotations Found"
              description="No annotations match the selected labels, or no annotations have been created yet."
            />,
          ];
        }

        panes = [
          ...panes,
          {
            menuItem: "Annotated Text",
            render: () => (
              <Tab.Pane
                key="AnnotatorSidebar_Spantab"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyItems: "flex-start",
                  padding: "1em",
                  flexBasis: "100px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyItems: "flex-start",
                    flex: 1,
                    minHeight: 0,
                    flexBasis: "100px",
                  }}
                >
                  <Segment
                    attached="top"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyItems: "flex-start",
                      flex: 1,
                      flexBasis: "100px",
                      overflow: "hidden",
                      paddingBottom: ".5rem",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        flexBasis: "100px",
                        overflow: "auto",
                      }}
                    >
                      <ul className="sidebar__annotations">
                        {text_highlight_elements}
                      </ul>
                    </div>
                  </Segment>
                </div>
              </Tab.Pane>
            ),
          },
        ];
      }

      const show_relation_pane =
        !selected_extract &&
        (relations.length > 0 ||
          (selected_corpus?.labelSet &&
            corpus_permissions.includes(PermissionTypes.CAN_UPDATE)));

      if (show_relation_pane) {
        let relation_elements = [<></>];
        if (relations && relations.length > 0) {
          relation_elements = relations?.map((relation, index) => {
            let source_annotations = _.intersectionWith(
              annotations,
              relation.sourceIds,
              ({ id }, annotationId: string) => id === annotationId
            );

            let target_annotations = _.intersectionWith(
              annotations,
              relation.targetIds,
              ({ id }, annotationId: string) => id === annotationId
            );

            return (
              <RelationItem
                key={`relation_item_${relation.id}`}
                relation={relation}
                read_only={read_only}
                selected={selectedRelations.includes(relation)}
                source_annotations={source_annotations}
                target_annotations={target_annotations}
                onSelectAnnotation={toggleSelectedAnnotation}
                onSelectRelation={() =>
                  toggleSelectedRelation(relation, [
                    ...target_annotations.map((a) => a.id),
                    ...source_annotations.map((a) => a.id),
                  ])
                }
                onRemoveAnnotationFromRelation={onRemoveAnnotationFromRelation}
                onDeleteRelation={onDeleteRelation}
              />
            );
          });
          // TODO - add fetch more on visible.
        } else {
          relation_elements = [
            <PlaceholderCard
              style={{ flex: 1 }}
              title="No Relations Found"
              description="Either no matching relations were created or you didn't create them yet."
            />,
          ];
        }

        panes = [
          ...panes,
          {
            menuItem: "Relationships",
            render: () => (
              <Tab.Pane
                key="AnnotatorSidebar_Relationshiptab"
                style={{
                  overflowY: "scroll",
                  margin: "0px",
                  width: "100%",
                  flex: 1,
                }}
              >
                <Card.Group key="relationship_card_group">
                  {relation_elements}
                </Card.Group>
              </Tab.Pane>
            ),
          },
        ];
      }

      const show_search_results_pane = searchResults.length > 0;
      if (show_search_results_pane) {
        panes = [
          ...panes,
          {
            menuItem: "Search",
            render: () => (
              <Tab.Pane
                className="AnnotatorSidebar_Searchtab"
                key="AnnotatorSidebar_Searchtab"
                style={{
                  margin: "0px",
                  width: "100%",
                  height: "100%",
                  padding: "0px",
                  overflow: "hidden",
                }}
              >
                <SearchSidebarWidget />
              </Tab.Pane>
            ),
          },
        ];
        setShowSearchPane(true);
      } else {
        setShowSearchPane(false);
      }

      // Show data pane IF we have a selected_extract;
      const show_data_pane = Boolean(selected_extract);
      if (show_data_pane) {
        panes = [
          ...panes,
          {
            menuItem: "Data",
            render: () => (
              <Tab.Pane style={{ flex: 1 }}>
                {selected_extract ? (
                  // Render extract data here
                  <SingleDocumentExtractResults
                    datacells={datacells}
                    columns={columns}
                  />
                ) : (
                  <Placeholder fluid />
                )}
              </Tab.Pane>
            ),
          },
        ];
      }

      setSidebarVisible(
        show_annotation_pane ||
          show_relation_pane ||
          show_search_results_pane ||
          show_data_pane
      );

      setPanes(panes);
    } catch {}
  }, [
    filteredAnnotations,
    relations,
    searchResults,
    selected_corpus,
    isSidebarVisible,
  ]);

  useEffect(() => {
    if (showSearchPane) {
      setActiveIndex(panes.length - 1);
    }
  }, [showSearchPane, panes]);

  // If our activeIndex is out of bounds, reset to 0
  useEffect(() => {
    if (activeIndex > panes.length - 1) {
      setActiveIndex(0);
    }
  }, [panes, activeIndex]);

  // If we have search results pane open... set index to last index
  const onRemoveAnnotationFromRelation = (
    annotationId: string,
    relationId: string
  ) => {
    removeAnnotationFromRelation(annotationId, relationId);
  };

  const onDeleteAnnotation = (annotationId: string) => {
    handleDeleteAnnotation(annotationId);
  };

  const onDeleteRelation = (relationId: string) => {
    handleRemoveRelationship(relationId);
  };

  const toggleSelectedAnnotation = (toggledId: string) => {
    if (selectedAnnotations.includes(toggledId)) {
      setSelectedAnnotations(
        selectedAnnotations.filter((annotationId) => annotationId !== toggledId)
      );
    }
    // If the toggle is flipping us over to SELECTED
    else {
      let annotation = pdfAnnotations.annotations.filter(
        (annotation_obj) => annotation_obj.id === toggledId
      )[0];
      // Check the proposed id is actually in the annotation store
      if (annotation) {
        // If it is, and we have a reference to it in our annotation reference obj
        if (annotationElementRefs?.current[annotation.id]) {
          // Scroll annotation into view.
          annotationElementRefs?.current[annotation.id]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
      setSelectedAnnotations([toggledId]);
    }
  };

  const toggleSelectedRelation = (
    toggled_relation: RelationGroup,
    implicated_annotations: string[]
  ) => {
    if (_.find(selectedRelations, { id: toggled_relation.id })) {
      setSelectedRelations(
        selectedRelations.filter(
          (relation) => relation.id !== toggled_relation.id
        )
      );
      setSelectedAnnotations([]);
    } else {
      setSelectedRelations([toggled_relation]);
      setSelectedAnnotations(implicated_annotations);
    }
  };

  // Create the label display options
  const labelDisplayOptions = [
    {
      key: LabelDisplayBehavior.ALWAYS,
      text: "Always",
      value: LabelDisplayBehavior.ALWAYS,
    },
    {
      key: LabelDisplayBehavior.ON_HOVER,
      text: "On Hover",
      value: LabelDisplayBehavior.ON_HOVER,
    },
    {
      key: LabelDisplayBehavior.HIDE,
      text: "Never",
      value: LabelDisplayBehavior.HIDE,
    },
  ];

  return (
    <SidebarContainer
      width={width.toString()}
      id="AnnotatorSidebarContainer"
      style={{
        display: !isSidebarVisible || show_minimal_layout ? "none" : "flex",
      }}
    >
      <TopSection>
        <HeaderRow>
          <TitleGroup>
            <Title>Annotations</Title>
            <ModeBadge mode={allowInput && !read_only ? "edit" : "view"}>
              <Icon name={allowInput && !read_only ? "edit" : "eye"} />
              {header_text.match(/\((.*?)\)/)?.[1] || "View Mode"}
            </ModeBadge>
          </TitleGroup>

          <ActionButtons>
            <ViewSettingsPopup label_display_options={labelDisplayOptions} />
            <ActionButton
              trigger={
                <button
                  onClick={() => setShowCorpusStats(!showCorpusStats)}
                  data-active={showCorpusStats}
                >
                  <Icon name="chart bar outline" />
                </button>
              }
              content="View Statistics"
              position="bottom center"
            />
            <ActionButton
              trigger={
                <button
                  onClick={() => {
                    const currentValue = showStructuralAnnotations();
                    showStructuralAnnotations(!currentValue);
                  }}
                  data-active={showStructuralAnnotations()}
                >
                  <Icon name="filter" />
                </button>
              }
              content="Toggle Structural Annotations"
              position="bottom center"
            />
            <ActionButton
              trigger={
                <button
                  onClick={() => setShowCorpusStats(true)}
                  data-active={showCorpusStats}
                >
                  <Icon name={opened_corpus ? "book" : "bookmark outline"} />
                </button>
              }
              content={
                opened_corpus ? (
                  <CorpusStats
                    corpus={opened_corpus}
                    onUnselect={() => openedCorpus(null)}
                  />
                ) : (
                  <Header as="h4" icon textAlign="center">
                    <Icon name="search" circular />
                    <Header.Content>No corpus selected</Header.Content>
                  </Header>
                )
              }
              position="bottom right"
              flowing
              hoverable
            />
          </ActionButtons>
        </HeaderRow>

        <StatsRow size="tiny">
          <Statistic>
            <StatisticValue>{filteredAnnotations.length}</StatisticValue>
            <StatisticLabel>Annotations</StatisticLabel>
          </Statistic>
          <Statistic>
            <StatisticValue>
              {opened_corpus?.creator?.email?.split("@")[0] || "Unknown"}
            </StatisticValue>
            <StatisticLabel>Creator</StatisticLabel>
          </Statistic>
          <Statistic>
            <StatisticValue>
              {new Date(opened_corpus?.modified).toLocaleDateString()}
            </StatisticValue>
            <StatisticLabel>Last Updated</StatisticLabel>
          </Statistic>
        </StatsRow>
      </TopSection>
      <StyledTab
        menu={{ secondary: true, pointing: true }}
        activeIndex={activeIndex}
        onTabChange={handleTabChange}
        panes={panes.map((pane) => ({
          ...pane,
          render: () => (
            <ContentContainer>
              {pane.render ? pane.render() : null}
            </ContentContainer>
          ),
        }))}
      />
    </SidebarContainer>
  );
};

export default AnnotatorSidebar;
