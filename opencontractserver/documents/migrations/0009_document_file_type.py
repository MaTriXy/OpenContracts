# Generated by Django 4.2.16 on 2024-09-29 03:14

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0008_documentanalysisrow_analysis_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="file_type",
            field=models.CharField(default="application/pdf", max_length=255),
        ),
    ]
