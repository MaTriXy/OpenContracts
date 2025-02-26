# Generated by Django 4.2.16 on 2025-01-20 07:02

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("corpuses", "0014_alter_corpus_label_set"),
    ]

    operations = [
        migrations.AddField(
            model_name="corpus",
            name="post_processors",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="List of fully qualified Python paths to post-processor functions",
            ),
        ),
    ]
