-- Full-text search (FTS5) on topic titles, descriptions and notes.
-- One row per searchable text: `field` is 'title', 'description' or 'note'; `note_id` is set for notes.
-- The index keeps its own copy of the text (no external content table): topics use TEXT ids, and rowids of such
-- tables may change on VACUUM. Triggers keep it in step with every write.
-- `remove_diacritics 2` makes "etape" match "étape".
CREATE VIRTUAL TABLE `search_index` USING fts5(
  body,
  topic_id UNINDEXED,
  field UNINDEXED,
  note_id UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `search_index` (body, topic_id, field) SELECT title, id, 'title' FROM topics;
--> statement-breakpoint
INSERT INTO `search_index` (body, topic_id, field) SELECT description, id, 'description' FROM topics;
--> statement-breakpoint
INSERT INTO `search_index` (body, topic_id, field, note_id) SELECT body, topic_id, 'note', id FROM topic_notes;
--> statement-breakpoint
CREATE TRIGGER `search_topics_insert` AFTER INSERT ON topics BEGIN
  INSERT INTO search_index (body, topic_id, field) VALUES (new.title, new.id, 'title');
  INSERT INTO search_index (body, topic_id, field) VALUES (new.description, new.id, 'description');
END;
--> statement-breakpoint
CREATE TRIGGER `search_topics_title` AFTER UPDATE OF title ON topics BEGIN
  UPDATE search_index SET body = new.title WHERE topic_id = old.id AND field = 'title';
END;
--> statement-breakpoint
CREATE TRIGGER `search_topics_description` AFTER UPDATE OF description ON topics BEGIN
  UPDATE search_index SET body = new.description WHERE topic_id = old.id AND field = 'description';
END;
--> statement-breakpoint
CREATE TRIGGER `search_topics_delete` AFTER DELETE ON topics BEGIN
  DELETE FROM search_index WHERE topic_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `search_notes_insert` AFTER INSERT ON topic_notes BEGIN
  INSERT INTO search_index (body, topic_id, field, note_id) VALUES (new.body, new.topic_id, 'note', new.id);
END;
--> statement-breakpoint
CREATE TRIGGER `search_notes_body` AFTER UPDATE OF body ON topic_notes BEGIN
  UPDATE search_index SET body = new.body WHERE note_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `search_notes_delete` AFTER DELETE ON topic_notes BEGIN
  DELETE FROM search_index WHERE note_id = old.id;
END;
