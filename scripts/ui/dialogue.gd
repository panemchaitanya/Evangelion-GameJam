class_name Dialogue
extends CanvasLayer
## Bottom text box with typewriter. Advance with E/Space. Emits done.

signal done

var panel: Panel
var name_label: Label
var text_label: RichTextLabel
var lines: Array = []
var idx := 0
var typing := false
var shown := 0.0
var active := false

func _ready() -> void:
	layer = 20
	panel = Panel.new()
	panel.position = Vector2(140, 520)
	panel.size = Vector2(1000, 150)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.04, 0.03, 0.06, 0.88)
	sb.border_color = Color(0.85, 0.65, 0.4, 0.8)
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(6)
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)
	name_label = Label.new()
	name_label.position = Vector2(24, 10)
	name_label.add_theme_font_size_override("font_size", 20)
	name_label.add_theme_color_override("font_color", Color(1, 0.8, 0.5))
	panel.add_child(name_label)
	text_label = RichTextLabel.new()
	text_label.position = Vector2(24, 44)
	text_label.size = Vector2(950, 96)
	text_label.add_theme_font_size_override("normal_font_size", 22)
	text_label.add_theme_color_override("default_color", Color(0.95, 0.92, 0.88))
	text_label.bbcode_enabled = false
	text_label.scroll_active = false
	panel.add_child(text_label)
	panel.visible = false

## lines: Array of [speaker, text]
func play(l: Array) -> void:
	lines = l
	idx = 0
	active = true
	panel.visible = true
	_show()

func _show() -> void:
	var ln: Array = lines[idx]
	name_label.text = ln[0]
	text_label.text = ln[1]
	text_label.visible_characters = 0
	shown = 0.0
	typing = true

func _process(delta: float) -> void:
	if not active:
		return
	if typing:
		shown += delta * 55.0
		text_label.visible_characters = int(shown)
		if int(shown) >= text_label.text.length():
			typing = false

func _unhandled_input(e: InputEvent) -> void:
	if not active:
		return
	if e.is_action_pressed("interact") or e.is_action_pressed("jump") or (e is InputEventMouseButton and e.pressed):
		get_viewport().set_input_as_handled()
		if typing:
			text_label.visible_characters = -1
			typing = false
			return
		idx += 1
		if idx >= lines.size():
			active = false
			panel.visible = false
			emit_signal("done")
		else:
			_show()
