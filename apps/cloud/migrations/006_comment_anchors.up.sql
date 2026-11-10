-- Preserve inline ranges instead of silently dropping the API's from/to values.
ALTER TABLE comments ADD COLUMN anchor_from INTEGER;
ALTER TABLE comments ADD COLUMN anchor_to INTEGER;
ALTER TABLE comments ADD CONSTRAINT comments_anchor_range CHECK (
    (anchor_from IS NULL AND anchor_to IS NULL) OR
    (anchor_from IS NOT NULL AND anchor_to IS NOT NULL AND anchor_from >= 0 AND anchor_to >= anchor_from)
);
