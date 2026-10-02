extends Node
## Top-level flow: title -> levels. Restarts the current level when caught.

var level: Level
var level_id := "test"

func _ready() -> void:
	load_level(level_id)

func load_level(id: String) -> void:
	if level:
		level.queue_free()
		await get_tree().process_frame
	level_id = id
	level = Levels.create(id)
	level.caught.connect(_on_caught)
	level.finished.connect(_on_finished)
	add_child(level)

func _on_caught() -> void:
	call_deferred("load_level", level_id)

func _on_finished() -> void:
	pass
