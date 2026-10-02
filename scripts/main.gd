extends Node
## Top-level flow: title -> levels. Restarts the current level when caught.

var level: Level
var level_id := "title"

func _ready() -> void:
	# Dev shortcut: ?level=act2_gate on the web build, or `-- --level act2_gate` on desktop.
	if OS.has_feature("web"):
		var q = JavaScriptBridge.eval("new URLSearchParams(location.search).get('level')")
		if q is String and q != "":
			level_id = q
	else:
		var args := OS.get_cmdline_user_args()
		for i in args.size() - 1:
			if args[i] == "--level":
				level_id = args[i + 1]
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

func _on_finished(next: String) -> void:
	call_deferred("load_level", next)
