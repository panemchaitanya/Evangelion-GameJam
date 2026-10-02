class_name LevelCredits
extends Level
## End credits over a looping silhouette run-cycle with scrolling parallax. Also used as the title backdrop.

var title_mode := false
var scene: Node2D
var roll: Label
var scroll_y := 760.0
const LINES := """THE STARS THAT SANK US TO SLEEP
Part 1: Lullaby

TEAM EVANGELION
Panem Chaitanya Pavan Kumar
Prakash Bhabad
Metta Venkata Ramana Murthy

Game design, code, art and music
built inside the TGC Game Jam 2026 window
with an AI coding assistant, under the team's direction

All art, sound and music are generated in code.
The lullaby is original.

Built with Godot 4

Thank you for playing.

This is Part 1.
The escape is only the beginning."""

func build() -> void:
	ambient = Color(1, 1, 1)
	bounds = Rect2(0, 0, 1280, 720)
	scene = RunScene.new()
	add_child(scene)

func _ready() -> void:
	super._ready()
	hint_label.text = ""
	kid_label.text = ""
	cam.enabled = false
	roll = Label.new()
	roll.add_theme_font_size_override("font_size", 30)
	roll.add_theme_color_override("font_color", Color(1, 0.95, 0.85))
	roll.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	roll.add_theme_constant_override("outline_size", 6)
	roll.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	roll.size = Vector2(1280, 900)
	hud.add_child(roll)
	if title_mode:
		roll.text = "THE STARS THAT SANK US TO SLEEP\n\nPart 1: Lullaby\n\n\n\nPress E to begin\n\nA/D move   Space jump   E use   Tab switch kid   R restart night"
		roll.position = Vector2(0, 150)
	else:
		roll.text = LINES
		roll.position = Vector2(0, scroll_y)
		Music.lullaby(0.5, 0.5, true)

func _physics_process(delta: float) -> void:
	time += delta
	if title_mode:
		return
	scroll_y -= 42.0 * delta
	roll.position.y = scroll_y
	if scroll_y < -1050.0:
		scroll_y = -1050.0

func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("interact") or e.is_action_pressed("jump"):
		if title_mode:
			Game.reset()
			emit_signal("finished", "act1")
		elif scroll_y <= -1000.0:
			Music.stop_music()
			emit_signal("finished", "title")

class RunScene extends Node2D:
	var t := 0.0
	func _process(d: float) -> void:
		t += d
		queue_redraw()
	func _draw() -> void:
		# sky
		for i in 20:
			var f := float(i) / 20.0
			draw_rect(Rect2(0, i * 36, 1280, 37), Color(0.05, 0.07, 0.17).lerp(Color(0.55, 0.35, 0.35), f * f))
		var rng := RandomNumberGenerator.new()
		rng.seed = 11
		for i in 50:
			draw_circle(Vector2(rng.randf() * 1280, rng.randf() * 360), rng.randf_range(0.8, 1.8), Color(1, 1, 1, rng.randf_range(0.3, 0.9)))
		draw_circle(Vector2(980, 140), 44, Color(0.95, 0.94, 0.85))
		# far hills (slow), near hills (faster)
		_hills(0.1, Color(0.10, 0.10, 0.20), 470.0, 60.0, 0.006)
		_hills(0.3, Color(0.06, 0.06, 0.13), 540.0, 70.0, 0.009)
		draw_rect(Rect2(0, 600, 1280, 120), Color(0.03, 0.03, 0.07))
		# ground ticks scrolling
		for i in 30:
			var x := fposmod(i * 70.0 - t * 260.0, 1400.0) - 60.0
			draw_rect(Rect2(x, 604, 36, 4), Color(0.1, 0.1, 0.16))
		# the three kids, running right, in the cold light
		for i in 3:
			var h: float = [92.0, 118.0, 110.0][i]
			_runner(Vector2(480 + i * 120, 600), h, t * 9.0 + i * 1.7)
	func _hills(speed: float, col: Color, base: float, amp: float, freq: float) -> void:
		var pts := PackedVector2Array()
		for x in range(0, 1300, 20):
			pts.append(Vector2(x, base - amp * (0.5 + 0.5 * sin((x + t * speed * 400.0) * freq))))
		pts.append(Vector2(1300, 720))
		pts.append(Vector2(0, 720))
		draw_colored_polygon(pts, col)
	func _runner(base: Vector2, h: float, ph: float) -> void:
		var col := Color(0.02, 0.02, 0.05)
		var bob := absf(sin(ph)) * 4.0
		var b := base + Vector2(0, -bob)
		draw_circle(b + Vector2(0, -h * 0.86), h * 0.1, col)
		draw_colored_polygon(PackedVector2Array([b + Vector2(-h * 0.1, -h * 0.74), b + Vector2(h * 0.1, -h * 0.74), b + Vector2(h * 0.13, -h * 0.32), b + Vector2(-h * 0.13, -h * 0.32)]), col)
		draw_line(b + Vector2(0, -h * 0.34), b + Vector2(sin(ph) * h * 0.2, 0), col, 5.0)
		draw_line(b + Vector2(0, -h * 0.34), b + Vector2(-sin(ph) * h * 0.2, 0), col, 5.0)
		draw_line(b + Vector2(0, -h * 0.66), b + Vector2(-sin(ph) * h * 0.18 + 6, -h * 0.4), col, 4.0)
		draw_line(b + Vector2(0, -h * 0.66), b + Vector2(sin(ph) * h * 0.18 + 6, -h * 0.4), col, 4.0)
