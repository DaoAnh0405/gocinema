CREATE TABLE IF NOT EXISTS room_layouts (
    room_id INT PRIMARY KEY,
    row_count INT NOT NULL,
    column_count INT NOT NULL,
    CONSTRAINT fk_room_layout_room FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE,
    CONSTRAINT chk_room_layout_rows CHECK (row_count BETWEEN 1 AND 702),
    CONSTRAINT chk_room_layout_columns CHECK (column_count BETWEEN 1 AND 100)
) ENGINE=InnoDB;
