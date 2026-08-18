-- Tabela única de contadores. Uma linha por dia + tipo + galeria + foto.
CREATE TABLE IF NOT EXISTS events (
  day     TEXT    NOT NULL,   -- 2026-08-18
  kind    TEXT    NOT NULL,   -- page | gallery | view | download
  gallery TEXT    NOT NULL DEFAULT '',
  photo   TEXT    NOT NULL DEFAULT '',
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, gallery, photo)
);

CREATE INDEX IF NOT EXISTS events_day ON events (day);
CREATE INDEX IF NOT EXISTS events_gallery ON events (gallery, kind);
