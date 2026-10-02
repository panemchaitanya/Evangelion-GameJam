class_name Interactable
extends Node2D
## A spot a kid can use with E. Draws a soft prompt when the active kid is near.

var rect := Rect2(-30, -60, 60, 60)
var prompt := "E"
var callback := Callable()
var once := false
var used := false
var enabled := true
var only_kind := -1  # restrict to one kid kind, -1 = any
var glow := true

static func make(pos: Vector2, size: Vector2, text: String, cb: Callable, once_only: bool = true, kind_only: int = -1) -> Interactable:
	var i := Interactable.new()
	i.position = pos
	i.rect = Rect2(-size.x / 2.0, -size.y, size.x, size.y)
	i.prompt = text
	i.callback = cb
	i.once = once_only
	i.only_kind = kind_only
	i.add_to_group("interactables")
	return i

func can_use(k: Kid) -> bool:
	if not enabled or (once and used):
		return false
	if only_kind >= 0 and k.kind != only_kind:
		return false
	return rect.has_point(to_local(k.global_position))

func use(k: Kid) -> void:
	used = true
	if callback.is_valid():
		callback.call(k)
	queue_redraw()

func _process(_d: float) -> void:
	queue_redraw()

func _draw() -> void:
	if not enabled or (once and used):
		return
	var lv := get_parent() as Level
	var near := false
	if lv and lv.active_kid():
		near = can_use(lv.active_kid())
	var a := 0.9 if near else 0.28
	if glow:
		draw_circle(Vector2(0, rect.position.y - 8), 5.0, Color(1, 0.9, 0.6, a))
	if near:
		draw_string(ThemeDB.fallback_font, Vector2(-70, rect.position.y - 20), "E  " + prompt, HORIZONTAL_ALIGNMENT_CENTER, 140, 15, Color(1, 0.95, 0.8))
