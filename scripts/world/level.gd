class_name Level
extends Node2D
## Base level: owns the kids, camera, exposure meter, darkness, and restart-on-caught.
## Subclasses override build().

signal caught
signal finished

var kids: Array[Kid] = []
var active_idx := 0
var cam: Camera2D
var exposure := 0.0
var exposure_rate := 0.55
var exposure_decay := 0.4
var bounds := Rect2(0, 0, 2400, 900)
var ambient := Color(0.30, 0.32, 0.50)
var modulate_node: CanvasModulate
var vignette: ColorRect
var hud: CanvasLayer
var hint_label: Label
var kid_label: Label
var ended := false
var stealth_on := true
var time := 0.0

func _ready() -> void:
	modulate_node = CanvasModulate.new()
	modulate_node.color = ambient
	add_child(modulate_node)
	build()
	_make_camera()
	_make_hud()
	if kids.size() > 0:
		switch_to(0)

func build() -> void:
	pass

func add_kid(k: int, pos: Vector2) -> Kid:
	var kd := Kid.make(k)
	kd.position = pos
	add_child(kd)
	kids.append(kd)
	return kd

func active_kid() -> Kid:
	return kids[active_idx] if kids.size() > 0 else null

func switch_to(i: int) -> void:
	active_idx = i % kids.size()
	for j in kids.size():
		kids[j].set_active(j == active_idx)
	if kid_label:
		kid_label.text = kids[active_idx].kid_name
	Sfx.blip(660.0 if active_idx != 1 else 440.0, 0.06, 0.15)

func next_kid() -> void:
	switch_to(active_idx + 1)

func _make_camera() -> void:
	cam = Camera2D.new()
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 6.0
	cam.limit_left = int(bounds.position.x)
	cam.limit_right = int(bounds.end.x)
	cam.limit_top = int(bounds.position.y)
	cam.limit_bottom = int(bounds.end.y)
	add_child(cam)
	cam.make_current()
	if active_kid():
		cam.global_position = active_kid().global_position

func _make_hud() -> void:
	hud = CanvasLayer.new()
	hud.layer = 10
	add_child(hud)
	vignette = ColorRect.new()
	vignette.set_anchors_preset(Control.PRESET_FULL_RECT)
	vignette.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = Gfx.vignette_shader()
	vignette.material = m
	hud.add_child(vignette)
	kid_label = Label.new()
	kid_label.position = Vector2(20, 14)
	kid_label.add_theme_font_size_override("font_size", 20)
	kid_label.add_theme_color_override("font_color", Color(1, 0.92, 0.7))
	hud.add_child(kid_label)
	hint_label = Label.new()
	hint_label.position = Vector2(20, 680)
	hint_label.add_theme_font_size_override("font_size", 16)
	hint_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.55))
	hint_label.text = "A/D move  ·  Space jump  ·  E interact  ·  Tab switch kid  ·  R restart"
	hud.add_child(hint_label)

func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("switch_kid"):
		next_kid()
		get_viewport().set_input_as_handled()
	elif e.is_action_pressed("interact"):
		var k := active_kid()
		if k:
			if k.holding != null:
				(k.holding as Rope).release(Vector2(k.facing * 80.0, -120.0))
			else:
				for r in get_tree().get_nodes_in_group("ropes"):
					if (r as Rope).grab(k):
						break
	elif e.is_action_pressed("jump") and active_kid() and active_kid().holding != null:
		var k2 := active_kid()
		(k2.holding as Rope).release(Vector2(k2.facing * 160.0, -240.0))
	elif e.is_action_pressed("restart"):
		emit_signal("caught")

func _physics_process(delta: float) -> void:
	time += delta
	if ended or kids.is_empty():
		return
	cam.global_position = active_kid().global_position + Vector2(0, -40)
	if stealth_on:
		_update_exposure(delta)

func _update_exposure(delta: float) -> void:
	var lit := false
	for l in get_tree().get_nodes_in_group("danger_lights"):
		for kd in kids:
			var p := kd.global_position
			if l.is_lit(p) or l.is_lit(p + Vector2(0, -kd.body_size.y * 0.6)):
				lit = true
				break
		if lit:
			break
	if lit:
		exposure = minf(1.0, exposure + exposure_rate * delta)
	else:
		exposure = maxf(0.0, exposure - exposure_decay * delta)
	(vignette.material as ShaderMaterial).set_shader_parameter("amount", exposure)
	if exposure >= 1.0 and not ended:
		ended = true
		Sfx.blip(120.0, 0.5, 0.3)
		emit_signal("caught")

func say(text: String) -> void:
	hint_label.text = text
