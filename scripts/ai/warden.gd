class_name Warden
extends Node2D
## Warden AI: patrol -> investigate (noise) -> search. Carries a lantern cone that is a
## real danger light (same data drives visuals and detection).
## Styles: "routine" (predictable, learnable), "erratic" (guest warden: random pauses,
## turn-backs, lantern sweeps; invalidates what the kids memorised).

enum State { PATROL, PAUSE, INVESTIGATE, SEARCH }

var kind := "mom"
var style := "routine"
var waypoints: Array[float] = []
var floor_y := 600.0
var speed := 70.0
var wp_i := 0
var dir := 1.0
var state := State.PATROL
var timer := 0.0
var target_x := 0.0
var lamp: Searchlight
var rng := RandomNumberGenerator.new()
var pauses := 1.2
var enabled := true
var sweep_t := 0.0
var height := 92.0
var body_color := Color(0.12, 0.10, 0.14)
var accent := Color(0.7, 0.6, 0.5)
var step_t := 0.0
var scripted := false

static func make(k: String, pts: Array, fy: float, st: String = "routine") -> Warden:
	var w := Warden.new()
	w.kind = k
	w.style = st
	for p in pts:
		w.waypoints.append(float(p))
	w.floor_y = fy
	w.position = Vector2(w.waypoints[0], fy)
	w.rng.seed = 7777 + hash(k)
	match k:
		"mom":
			w.body_color = Color(0.22, 0.14, 0.16); w.accent = Color(0.85, 0.72, 0.6)
			w.speed = 60.0; w.pauses = 2.0
		"night":
			w.body_color = Color(0.08, 0.09, 0.14); w.accent = Color(0.5, 0.55, 0.7)
			w.speed = 75.0; w.pauses = 1.4
		"guest":
			w.body_color = Color(0.06, 0.05, 0.07); w.accent = Color(0.8, 0.8, 0.85)
			w.speed = 95.0; w.pauses = 0.6; w.height = 104.0
	w._make_lamp()
	w.add_to_group("wardens")
	return w

func _make_lamp() -> void:
	lamp = Searchlight.new()
	add_child(lamp)
	var reach := 260.0 if kind != "guest" else 320.0
	var ha := 0.42 if kind != "guest" else 0.34
	lamp.setup(Vector2(14, -height * 0.55), 0.0, 0.0, 0.0, 0.0, reach, ha)
	lamp.light.color = Gfx.AMBER if kind != "guest" else Color(0.75, 0.9, 1.0)
	lamp.light.energy = 1.6
	lamp.remove_from_group("danger_lights")
	lamp.add_to_group("danger_lights")
	lamp.set_physics_process(false)  # warden drives the aim
	_aim()

func _aim() -> void:
	var tilt := 0.18
	lamp.position = Vector2(14.0 * dir, -height * 0.5)
	lamp.rotation = (0.0 if dir > 0 else PI) + tilt * dir + sin(sweep_t * 1.4) * (0.16 if style == "erratic" else 0.05)

func hear(pos: Vector2, loud: float) -> void:
	if not enabled or state == State.INVESTIGATE:
		return
	if absf(pos.y - floor_y) > 260.0:
		return
	if absf(pos.x - position.x) < 380.0 * loud + 60.0:
		state = State.INVESTIGATE
		target_x = pos.x
		dir = signf(pos.x - position.x) if pos.x != position.x else dir

func set_enabled(e: bool) -> void:
	enabled = e
	visible = e
	lamp.set_enabled(e)

func _physics_process(delta: float) -> void:
	if not enabled:
		return
	if scripted:
		sweep_t += delta
		_aim()
		queue_redraw()
		return
	sweep_t += delta
	timer -= delta
	match state:
		State.PATROL:
			var tx := waypoints[wp_i]
			dir = signf(tx - position.x) if absf(tx - position.x) > 2.0 else dir
			position.x = move_toward(position.x, tx, speed * delta)
			if absf(position.x - tx) < 2.0:
				_next_waypoint()
				state = State.PAUSE
				timer = pauses * (1.0 if style == "routine" else rng.randf_range(0.2, 2.4))
		State.PAUSE:
			if style == "erratic" and rng.randf() < 0.004:
				dir = -dir
			if timer <= 0.0:
				state = State.PATROL
		State.INVESTIGATE:
			dir = signf(target_x - position.x) if absf(target_x - position.x) > 2.0 else dir
			position.x = move_toward(position.x, target_x, speed * 1.4 * delta)
			if absf(position.x - target_x) < 6.0:
				state = State.SEARCH
				timer = 2.5
		State.SEARCH:
			if timer <= 0.0:
				state = State.PATROL
			elif fmod(timer, 1.0) < delta:
				dir = -dir
	if state == State.PATROL:
		step_t += delta
		if step_t > (0.5 if kind != "guest" else 0.38):
			step_t = 0.0
			var cam := get_viewport().get_camera_2d()
			if cam and cam.global_position.distance_to(global_position) < 700.0:
				Sfx.blip(70.0 if kind == "mom" else (110.0 if kind == "night" else 190.0), 0.05, 0.12, 2)
	_aim()
	queue_redraw()

func _next_waypoint() -> void:
	if style == "erratic":
		wp_i = rng.randi() % waypoints.size()
	else:
		wp_i = (wp_i + 1) % waypoints.size()

func _draw() -> void:
	var h := height
	var s := dir
	var bob := sin(sweep_t * 8.0) * 1.2 if state == State.PATROL else 0.0
	var body := body_color
	# long dress / cloak
	var cloak := PackedVector2Array([Vector2(-14, -h * 0.72 + bob), Vector2(14, -h * 0.72 + bob), Vector2(24, 0), Vector2(-24, 0)])
	draw_colored_polygon(cloak, body)
	draw_circle(Vector2(0, -h * 0.82 + bob), 11.0, Color(0.55, 0.43, 0.38).darkened(0.25))
	match kind:
		"mom":
			draw_arc(Vector2(0, -h * 0.84 + bob), 12.0, PI, TAU, 14, Color(0.25, 0.12, 0.08), 7.0)
			draw_circle(Vector2(-7 * s, -h * 0.98 + bob), 6.0, Color(0.25, 0.12, 0.08))
			draw_rect(Rect2(-12, -h * 0.5, 24, 22), Color(0.75, 0.68, 0.62))  # apron
		"night":
			draw_colored_polygon(PackedVector2Array([Vector2(-15, -h * 0.78), Vector2(0, -h * 1.02), Vector2(15, -h * 0.78)]), body.lightened(0.05))
		"guest":
			draw_colored_polygon(PackedVector2Array([Vector2(-26, -h * 0.86), Vector2(26, -h * 0.86), Vector2(0, -h * 0.98)]), body)
			draw_rect(Rect2(-2, -h * 0.6, 4, h * 0.6), accent)  # long stripe of the habit
	# face glints (eyes)
	draw_circle(Vector2(5 * s, -h * 0.82 + bob), 1.6, accent)
	# lantern
	draw_circle(Vector2(14 * s, -h * 0.5), 5.0, Gfx.AMBER if kind != "guest" else Color(0.8, 0.92, 1.0))
