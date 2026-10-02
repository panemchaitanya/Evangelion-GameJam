class_name MangaPage
extends CanvasLayer
## Comic-panel cutscene. Panels fill in one at a time (E / Space / click to advance).
## All art is drawn procedurally: gothic orphanage mood, silhouettes, big expressive eyes.
## Original character designs only.
##
## panel dict: {r: Rect2, art: String, text: String (caption), say: String (bubble), who: Vector2 (bubble pos in panel 0-1), tone: Color}

signal done

var panels: Array = []
var shown := 0
var t_in := 1.0
var canvas: Control
var active := false
var wait_t := 0.0

func _ready() -> void:
	layer = 40
	canvas = Control.new()
	canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	canvas.draw.connect(_draw_page)
	add_child(canvas)
	canvas.visible = false

func play(p: Array) -> void:
	panels = p
	shown = 0
	active = true
	canvas.visible = true
	_reveal_next()

func _reveal_next() -> void:
	shown += 1
	t_in = 0.0
	wait_t = 0.35
	Sfx.blip(180.0 + shown * 20.0, 0.05, 0.1, 2)

func _process(delta: float) -> void:
	if not active:
		return
	t_in = minf(1.0, t_in + delta * 3.0)
	wait_t = maxf(0.0, wait_t - delta)
	canvas.queue_redraw()

func _unhandled_input(e: InputEvent) -> void:
	if not active:
		return
	if e.is_action_pressed("interact") or e.is_action_pressed("jump") or (e is InputEventMouseButton and e.pressed):
		get_viewport().set_input_as_handled()
		if wait_t > 0.0:
			return
		if shown >= panels.size():
			active = false
			canvas.visible = false
			emit_signal("done")
		else:
			_reveal_next()

func _draw_page() -> void:
	var c := canvas
	c.draw_rect(Rect2(0, 0, 1280, 720), Color(0.97, 0.95, 0.9))
	# paper grain lines
	for i in 36:
		c.draw_line(Vector2(0, i * 20 + 10), Vector2(1280, i * 20 + 10), Color(0, 0, 0, 0.025), 1.0)
	for i in shown:
		var pn: Dictionary = panels[i]
		var r: Rect2 = pn["r"]
		var k := 1.0 if i < shown - 1 else t_in
		var off := Vector2((1.0 - k) * 30.0, 0)
		var rr := Rect2(r.position + off, r.size)
		_panel(c, rr, pn, k)
	if shown >= panels.size() and wait_t <= 0.0:
		c.draw_string(ThemeDB.fallback_font, Vector2(1000, 700), "E  continue", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.2, 0.2, 0.2, 0.7))
	else:
		c.draw_string(ThemeDB.fallback_font, Vector2(1000, 700), "E  next panel", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.2, 0.2, 0.2, 0.7))

func _panel(c: Control, r: Rect2, pn: Dictionary, k: float) -> void:
	var tone: Color = pn.get("tone", Color(0.1, 0.1, 0.2))
	c.draw_rect(r, tone.lightened(0.0))
	# art, clipped by drawing within r using helper that clamps
	_art(c, r, String(pn.get("art", "")), pn, k)
	# gothic double border
	c.draw_rect(r, Color(0.04, 0.03, 0.05), false, 6.0)
	c.draw_rect(r.grow(-8), Color(0.04, 0.03, 0.05, 0.6), false, 1.5)
	var cap: String = pn.get("text", "")
	if cap != "":
		var cw := minf(r.size.x - 24, 420.0)
		var lines := _wrap(cap, int(cw / 9.5))
		var ch := 22.0 * lines.size() + 14
		c.draw_rect(Rect2(r.position + Vector2(10, 10), Vector2(cw + 12, ch)), Color(0.97, 0.94, 0.86))
		c.draw_rect(Rect2(r.position + Vector2(10, 10), Vector2(cw + 12, ch)), Color(0.04, 0.03, 0.05), false, 2.0)
		for j in lines.size():
			c.draw_string(ThemeDB.fallback_font, r.position + Vector2(18, 31 + j * 22), lines[j], HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color(0.08, 0.06, 0.08))
	var say: String = pn.get("say", "")
	if say != "":
		var bp: Vector2 = pn.get("who", Vector2(0.5, 0.7))
		var bw := 260.0
		var lines2 := _wrap(say, int(bw / 9.5))
		var bh := 22.0 * lines2.size() + 18
		var pos := r.position + Vector2(bp.x * r.size.x - bw / 2.0, bp.y * r.size.y - bh)
		pos.x = clampf(pos.x, r.position.x + 8, r.end.x - bw - 8)
		pos.y = clampf(pos.y, r.position.y + 8, r.end.y - bh - 8)
		var br := Rect2(pos, Vector2(bw, bh))
		c.draw_rect(br, Color(1, 1, 1))
		c.draw_rect(br, Color(0.04, 0.03, 0.05), false, 2.5)
		var tail := PackedVector2Array([pos + Vector2(bw * 0.3, bh), pos + Vector2(bw * 0.45, bh), pos + Vector2(bw * 0.28, bh + 18)])
		c.draw_colored_polygon(tail, Color(1, 1, 1))
		for j in lines2.size():
			c.draw_string(ThemeDB.fallback_font, pos + Vector2(10, 22 + j * 22), lines2[j], HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color(0.05, 0.04, 0.06))

func _wrap(text: String, max_chars: int) -> Array:
	var out: Array = []
	var line := ""
	for w in text.split(" "):
		if (line + " " + w).length() > max_chars and line != "":
			out.append(line)
			line = w
		else:
			line = (line + " " + w).strip_edges()
	if line != "":
		out.append(line)
	return out

func _grad(c: Control, r: Rect2, top: Color, bot: Color) -> void:
	var n := 14
	for i in n:
		var f := float(i) / n
		c.draw_rect(Rect2(r.position.x, r.position.y + r.size.y * f, r.size.x, r.size.y / n + 1), top.lerp(bot, f))

func _stars(c: Control, r: Rect2, seed_v: int, n: int = 30) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_v
	for i in n:
		var p := r.position + Vector2(rng.randf() * r.size.x, rng.randf() * r.size.y * 0.6)
		c.draw_circle(p, rng.randf_range(0.8, 1.8), Color(1, 1, 1, rng.randf_range(0.4, 0.9)))

func _kid_sil(c: Control, base: Vector2, h: float, col: Color = Color(0.03, 0.03, 0.06)) -> void:
	c.draw_circle(base + Vector2(0, -h * 0.82), h * 0.14, col)
	c.draw_colored_polygon(PackedVector2Array([base + Vector2(-h * 0.16, -h * 0.66), base + Vector2(h * 0.16, -h * 0.66), base + Vector2(h * 0.24, 0), base + Vector2(-h * 0.24, 0)]), col)

func _eye(c: Control, p: Vector2, s: float, iris: Color, lookx: float = 0.0, tear: bool = false) -> void:
	c.draw_circle(p, s, Color(1, 1, 1))
	c.draw_arc(p, s, PI * 1.05, PI * 1.95, 18, Color(0.04, 0.03, 0.05), s * 0.22)
	c.draw_circle(p + Vector2(lookx * s * 0.2, s * 0.05), s * 0.68, iris)
	c.draw_circle(p + Vector2(lookx * s * 0.2, s * 0.05), s * 0.36, Color(0.03, 0.02, 0.05))
	c.draw_circle(p + Vector2(-s * 0.25, -s * 0.28), s * 0.2, Color(1, 1, 1))
	c.draw_circle(p + Vector2(s * 0.2, s * 0.22), s * 0.09, Color(1, 1, 1, 0.8))
	if tear:
		c.draw_circle(p + Vector2(s * 0.1, s * 1.15), s * 0.16, Color(0.7, 0.85, 1, 0.9))

func _art(c: Control, r: Rect2, art: String, pn: Dictionary, k: float) -> void:
	var cx := r.position.x + r.size.x / 2.0
	match art:
		"house_night":
			_grad(c, r, Color(0.05, 0.07, 0.18), Color(0.16, 0.14, 0.26))
			_stars(c, r, 3)
			c.draw_circle(r.position + Vector2(r.size.x * 0.8, r.size.y * 0.22), 26, Color(0.9, 0.92, 1.0))
			var b := r.position + Vector2(r.size.x * 0.12, r.size.y)
			c.draw_rect(Rect2(b + Vector2(0, -r.size.y * 0.5), Vector2(r.size.x * 0.62, r.size.y * 0.5)), Color(0.04, 0.03, 0.06))
			c.draw_colored_polygon(PackedVector2Array([b + Vector2(-10, -r.size.y * 0.5), b + Vector2(r.size.x * 0.31, -r.size.y * 0.78), b + Vector2(r.size.x * 0.62 + 10, -r.size.y * 0.5)]), Color(0.05, 0.04, 0.08))
			for i in 5:
				c.draw_rect(Rect2(b + Vector2(24 + i * (r.size.x * 0.11), -r.size.y * 0.4), Vector2(20, 28)), Color(1.0, 0.76, 0.4))
		"gate_beam":
			_grad(c, r, Color(0.02, 0.03, 0.08), Color(0.08, 0.1, 0.2))
			c.draw_colored_polygon(PackedVector2Array([r.position + Vector2(r.size.x, r.size.y * 0.1), r.position + Vector2(r.size.x * 0.3, r.size.y * 0.55), r.position + Vector2(r.size.x * 0.3, r.size.y), r.position + Vector2(r.size.x, r.size.y)]), Color(0.65, 0.82, 1.0, 0.45))
			for i in 7:
				c.draw_rect(Rect2(r.position.x + r.size.x * 0.28 + i * 22, r.position.y, 8, r.size.y), Color(0.02, 0.02, 0.04))
			for i in 3:
				_kid_sil(c, r.position + Vector2(r.size.x * (0.1 + i * 0.07), r.size.y * 0.95), r.size.y * (0.4 - i * 0.04))
		"delivery":
			_grad(c, r, Color(0.78, 0.9, 1.0), Color(0.3, 0.42, 0.58))
			for i in 6:
				c.draw_rect(Rect2(r.position + Vector2(20 + i * (r.size.x / 6.2), r.size.y * 0.42), Vector2(r.size.x / 8.0, r.size.y * 0.58)), Color(0.06, 0.08, 0.14))
				c.draw_rect(Rect2(r.position + Vector2(26 + i * (r.size.x / 6.2), r.size.y * 0.48), Vector2(10, 6)), Color(0.5, 0.9, 1.0))
			c.draw_rect(Rect2(r.position + Vector2(0, r.size.y * 0.9), Vector2(r.size.x, 14)), Color(0.04, 0.05, 0.09))
			# a small shape on a hook: the friend
			c.draw_line(r.position + Vector2(r.size.x * 0.5, r.size.y * 0.1), r.position + Vector2(r.size.x * 0.5, r.size.y * 0.45), Color(0.04, 0.05, 0.09), 3.0)
			c.draw_circle(r.position + Vector2(r.size.x * 0.5, r.size.y * 0.55), 13, Color(0.04, 0.05, 0.09))
			c.draw_colored_polygon(PackedVector2Array([r.position + Vector2(r.size.x * 0.5 - 14, r.size.y * 0.58), r.position + Vector2(r.size.x * 0.5 + 14, r.size.y * 0.58), r.position + Vector2(r.size.x * 0.5 + 10, r.size.y * 0.8), r.position + Vector2(r.size.x * 0.5 - 10, r.size.y * 0.8)]), Color(0.04, 0.05, 0.09))
		"eyes_wide":
			_grad(c, r, Color(0.1, 0.1, 0.18), Color(0.04, 0.04, 0.08))
			var s := minf(r.size.x * 0.16, r.size.y * 0.3)
			_eye(c, Vector2(cx - s * 1.3, r.position.y + r.size.y * 0.5), s, Color(0.35, 0.6, 0.9), 0.0, pn.get("tear", false))
			_eye(c, Vector2(cx + s * 1.3, r.position.y + r.size.y * 0.5), s, Color(0.35, 0.6, 0.9), 0.0, false)
			c.draw_line(Vector2(cx - s * 2.6, r.position.y + r.size.y * 0.3), Vector2(cx - s * 0.2, r.position.y + r.size.y * 0.34), Color(0.8, 0.8, 0.9, 0.5), 3.0)
		"mom_eye":
			_grad(c, r, Color(0.28, 0.16, 0.1), Color(0.08, 0.05, 0.06))
			var s2 := minf(r.size.x * 0.28, r.size.y * 0.34)
			_eye(c, Vector2(cx, r.position.y + r.size.y * 0.5), s2, Color(0.5, 0.34, 0.22), 0.0, true)
			c.draw_line(Vector2(cx - s2 * 1.3, r.position.y + r.size.y * 0.22), Vector2(cx + s2 * 1.3, r.position.y + r.size.y * 0.2), Color(0.05, 0.03, 0.04), 7.0)
		"rope_hand":
			_grad(c, r, Color(0.06, 0.1, 0.22), Color(0.1, 0.16, 0.3))
			c.draw_rect(Rect2(r.position + Vector2(r.size.x * 0.62, 0), Vector2(r.size.x * 0.38, r.size.y)), Color(1.0, 0.8, 0.5, 0.35))
			c.draw_line(r.position + Vector2(r.size.x * 0.5, 0), r.position + Vector2(r.size.x * 0.5, r.size.y), Color(0.6, 0.5, 0.35), 8.0)
			c.draw_circle(r.position + Vector2(r.size.x * 0.5, r.size.y * 0.5), 26, Color(0.85, 0.7, 0.58))
			c.draw_rect(Rect2(r.position + Vector2(r.size.x * 0.5 - 18, r.size.y * 0.5 - 22), Vector2(36, 12)), Color(0.9, 0.78, 0.66))
		"lullaby":
			_grad(c, r, Color(0.07, 0.06, 0.16), Color(0.2, 0.14, 0.18))
			for i in 7:
				var p := r.position + Vector2(r.size.x * (0.12 + i * 0.12), r.size.y * (0.7 - 0.08 * i + 0.06 * sin(i * 1.3)))
				c.draw_string(ThemeDB.fallback_font, p, "♪", HORIZONTAL_ALIGNMENT_LEFT, -1, 38 - i, Color(1.0, 0.88, 0.55, 0.9 - i * 0.07))
			_kid_sil(c, r.position + Vector2(r.size.x * 0.18, r.size.y * 0.98), r.size.y * 0.55)
		"wall_cross":
			_grad(c, r, Color(0.04, 0.08, 0.2), Color(0.12, 0.16, 0.3))
			_stars(c, r, 9, 40)
			c.draw_rect(Rect2(r.position + Vector2(r.size.x * 0.4, r.size.y * 0.3), Vector2(r.size.x * 0.12, r.size.y * 0.7)), Color(0.03, 0.03, 0.05))
			c.draw_line(r.position + Vector2(r.size.x * 0.32, r.size.y * 0.3), r.position + Vector2(r.size.x * 0.64, r.size.y * 0.3), Color(0.6, 0.5, 0.35), 4.0)
			_kid_sil(c, r.position + Vector2(r.size.x * 0.46, r.size.y * 0.32), r.size.y * 0.22)
		"doorway":
			_grad(c, r, Color(0.06, 0.1, 0.24), Color(0.1, 0.16, 0.3))
			c.draw_rect(Rect2(r.position + Vector2(r.size.x * 0.55, r.size.y * 0.3), Vector2(r.size.x * 0.2, r.size.y * 0.7)), Color(1.0, 0.82, 0.5))
			_kid_sil(c, r.position + Vector2(r.size.x * 0.65, r.size.y), r.size.y * 0.62, Color(0.02, 0.02, 0.04))
		"dorm_dark":
			_grad(c, r, Color(0.06, 0.06, 0.14), Color(0.1, 0.08, 0.14))
			for i in 3:
				c.draw_rect(Rect2(r.position + Vector2(20 + i * r.size.x * 0.32, r.size.y * 0.7), Vector2(r.size.x * 0.28, r.size.y * 0.3)), Color(0.04, 0.03, 0.07))
			c.draw_rect(Rect2(r.position + Vector2(r.size.x * 0.4, r.size.y * 0.1), Vector2(40, 60)), Color(0.3, 0.42, 0.7))
		"black":
			c.draw_rect(r, Color(0.02, 0.02, 0.04))
		_:
			_grad(c, r, tone_of(pn), Color(0.02, 0.02, 0.04))

func tone_of(pn: Dictionary) -> Color:
	return pn.get("tone", Color(0.1, 0.1, 0.2))
