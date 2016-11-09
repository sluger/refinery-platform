# -*- coding: utf-8 -*-
import json
import os
from django.core import serializers
from south.v2 import DataMigration


class Migration(DataMigration):

    def forwards(self, orm):
        data = [
          {
            "model": "file_store.FileType",
            "pk": 42,
            "fields": {
              "description": "Cooler file",
              "name": "Cooler",
              "used_for_visualization": True
            }
          },
          {
            "model": "file_store.FileType",
            "pk": 43,
            "fields": {
              "description": "Multi-Resolution Cooler file",
              "name": "Multires Cooler",
              "used_for_visualization": True
            }
          },
          {
            "model": "file_store.FileExtension",
            "pk": 42,
            "fields": {
              "name": ".cool",
              "filetype": 42
            }
          },
          {
            "model": "file_store.FileExtension",
            "pk": 43,
            "fields": {
              "name": ".multires.cool",
              "filetype": 43
            }
          }
        ]
        data_as_json = json.dumps([ob for ob in data])
        objects = serializers.deserialize('json', data_as_json, ignorenonexistent=True)
        for obj in objects:
            obj.save()

    def backwards(self, orm):
        "Brutally deleting all entries we created for this model..."
        orm.Filetype.objects.filter(pk__in=[42, 43]).delete()
        orm.FileExtension.objects.filter(pk__in=[42, 43]).delete()

    dependencies = [
        ('file_store', '0012_auto__add_field_filetype_used_for_visualization'),
    ]

    models = {
        u'file_store.fileextension': {
            'Meta': {'object_name': 'FileExtension'},
            'filetype': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['file_store.FileType']"}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '50'})
        },
        u'file_store.filestoreitem': {
            'Meta': {'object_name': 'FileStoreItem'},
            'created': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now', 'auto_now_add': 'True', 'blank': 'True'}),
            'datafile': ('django.db.models.fields.files.FileField', [], {'max_length': '1024', 'blank': 'True'}),
            'filetype': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['file_store.FileType']", 'null': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'import_task_id': ('django.db.models.fields.CharField', [], {'max_length': '36', 'blank': 'True'}),
            'sharename': ('django.db.models.fields.CharField', [], {'max_length': '20', 'blank': 'True'}),
            'source': ('django.db.models.fields.CharField', [], {'max_length': '1024'}),
            'updated': ('django.db.models.fields.DateTimeField', [], {'default': 'datetime.datetime.now', 'auto_now': 'True', 'blank': 'True'}),
            'uuid': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '36', 'blank': 'True'})
        },
        u'file_store.filetype': {
            'Meta': {'object_name': 'FileType'},
            'description': ('django.db.models.fields.CharField', [], {'max_length': '250'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'name': ('django.db.models.fields.CharField', [], {'unique': 'True', 'max_length': '50'}),
            'used_for_visualization': ('django.db.models.fields.BooleanField', [], {'default': 'False'})
        }
    }

    complete_apps = ['file_store']
    symmetrical = True
