# Generated by Django 4.2.14 on 2024-08-09 04:50

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("analyzer", "0006_alter_analyzer_task_name"),
        ("extracts", "0013_alter_column_user_lock_alter_datacell_user_lock_and_more"),
        ("corpuses", "0009_alter_corpusquery_user_lock"),
    ]

    operations = [
        migrations.CreateModel(
            name="CorpusAction",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("backend_lock", models.BooleanField(default=False)),
                ("is_public", models.BooleanField(default=False)),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("modified", models.DateTimeField(auto_now=True)),
                (
                    "trigger",
                    models.CharField(
                        choices=[
                            ("add_document", "Add Document"),
                            ("edit_document", "Edit Document"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "analyzer",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="analyzer.analyzer",
                    ),
                ),
                (
                    "corpus",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="actions",
                        to="corpuses.corpus",
                    ),
                ),
                (
                    "creator",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "fieldset",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="extracts.fieldset",
                    ),
                ),
                (
                    "user_lock",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="locked_%(class)s_objects",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="CorpusActionUserObjectPermission",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "content_object",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="corpuses.corpusaction",
                    ),
                ),
                (
                    "permission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="auth.permission",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "abstract": False,
                "unique_together": {("user", "permission", "content_object")},
            },
        ),
        migrations.CreateModel(
            name="CorpusActionGroupObjectPermission",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "content_object",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="corpuses.corpusaction",
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="auth.group"
                    ),
                ),
                (
                    "permission",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        to="auth.permission",
                    ),
                ),
            ],
            options={
                "abstract": False,
                "unique_together": {("group", "permission", "content_object")},
            },
        ),
        migrations.AddConstraint(
            model_name="corpusaction",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(("analyzer__isnull", True), ("fieldset__isnull", False)),
                    models.Q(("analyzer__isnull", False), ("fieldset__isnull", True)),
                    _connector="OR",
                ),
                name="exactly_one_of_fieldset_or_analyzer",
            ),
        ),
    ]
