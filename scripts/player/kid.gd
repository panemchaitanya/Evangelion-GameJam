class_name Kid
extends RigidBody2D
## A kid is a real physics body. Inactive kids keep their body (so they can hold ropes
## or stand on crates) but ignore input and brake hard.

enum Kind { SMALL, STRONG, OLDEST }

signal noise(pos: Vector2, loudness: float)

var kind: int = Kind.SMALL
var kid_name := ""
var active := false
var move_dir := 0.0
var want_jump := false
var on_ground := false
var facing := 1.0
var speed := 150.0
var jump_speed := 330.0
var body_size := Vector2(22, 40)
var color := Color.WHITE
var hum_t := 0.0
var frozen := false
var holding: Node2D = null  # rope handle etc, set by physics rigs
var _anim := 0.0

static func make(k: int) -> Kid:
	var kd := Kid.new()
	kd.kind = k
	match k:
		Kind.SMALL:
			kd.kid_name = "Small One"
			kd.body_size = Vector2(18, 32)
			kd.mass = 0.7
			kd.speed = 165.0
			kd.jump_speed = 340.0
			kd.color = Color(0.95, 0.80, 0.55)
		Kind.STRONG:
			kd.kid_name = "Strong One"
			kd.body_size = Vector2(28, 46)
			kd.mass = 6.0
			kd.speed = 120.0
			kd.jump_speed = 300.0
			kd.color = Color(0.80, 0.50, 0.40)
		_:
			kd.kid_name = "Oldest"
			kd.body_size = Vector2(22, 44)
			kd.mass = 1.4
			kd.speed = 150.0
			kd.jump_speed = 325.0
			kd.color = Color(0.60, 0.72, 0.95)
	kd._setup()
	return kd

func _setup() -> void:
	collision_layer = Builder.L_KID
	collision_mask = Builder.L_WORLD | Builder.L_PROP
	lock_rotation = true
	can_sleep = false
	continuous_cd = RigidBody2D.CCD_MODE_CAST_RAY
	contact_monitor = true
	max_contacts_reported = 6
	var pm := PhysicsMaterial.new()
	pm.friction = 0.9
	pm.bounce = 0.0
	physics_material_override = pm
	var cs := CollisionShape2D.new()
	var sh := CapsuleShape2D.new()
	sh.radius = body_size.x / 2.0
	sh.height = body_size.y
	cs.shape = sh
	add_child(cs)
	add_to_group("kids")

func _physics_process(delta: float) -> void:
	on_ground = _check_ground()
	if active and not frozen:
		move_dir = Input.get_axis("move_left", "move_right")
		if Input.is_action_just_pressed("jump"):
			want_jump = true
	else:
		move_dir = 0.0
		want_jump = false
	if move_dir != 0.0:
		facing = signf(move_dir)
		_anim += delta * 9.0
	hum_t = maxf(0.0, hum_t - delta)

func _check_ground() -> bool:
	var space := get_world_2d().direct_space_state
	var q := PhysicsRayQueryParameters2D.create(global_position, global_position + Vector2(0, body_size.y / 2.0 + 6.0))
	q.collision_mask = Builder.L_WORLD | Builder.L_PROP
	q.exclude = [get_rid()]
	return not space.intersect_ray(q).is_empty()

func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	var v := state.linear_velocity
	if holding != null:
		# Rope-holding kids are driven by the rig, not by walking.
		state.linear_velocity = v
		return
	if active:
		var target := move_dir * speed
		var accel := 1400.0 if on_ground else 500.0
		var pushing := _pushing_crate(state)
		if pushing:
			if kind == Kind.STRONG:
				target *= 0.55
				accel = 99999.0
			else:
				target = 0.0
		v.x = move_toward(v.x, target, accel * state.step)
		if want_jump and on_ground:
			v.y = -jump_speed
			emit_signal("noise", global_position, 0.2)
		want_jump = false
	else:
		if on_ground:
			v.x = move_toward(v.x, 0.0, 1800.0 * state.step)
	state.linear_velocity = v

func _pushing_crate(state: PhysicsDirectBodyState2D) -> bool:
	if move_dir == 0.0:
		return false
	for i in state.get_contact_count():
		var c := state.get_contact_collider_object(i)
		if c is Crate:
			var dx: float = c.global_position.x - global_position.x
			var dy: float = absf(c.global_position.y - global_position.y)
			if signf(dx) == signf(move_dir) and dy < 40.0 + c.size.y * 0.5 and absf(dx) < body_size.x + c.size.x * 0.5 + 6.0:
				return true
	return false

func set_active(a: bool) -> void:
	active = a
	queue_redraw()

func _process(_d: float) -> void:
	queue_redraw()

func _draw() -> void:
	var w := body_size.x
	var h := body_size.y + body_size.x  # capsule full height
	var top := -h / 2.0
	var sway := sin(_anim) * 2.0 if absf(linear_velocity.x) > 10.0 else 0.0
	var dark := color.darkened(0.35)
	# body (nightgown)
	var gown := PackedVector2Array([
		Vector2(-w * 0.45, top + h * 0.35), Vector2(w * 0.45, top + h * 0.35),
		Vector2(w * 0.62 + sway, h / 2.0), Vector2(-w * 0.62 + sway, h / 2.0)])
	draw_colored_polygon(gown, dark)
	# legs hint
	draw_rect(Rect2(-w * 0.3 + sway, h / 2.0 - 4, w * 0.22, 4), Color(0.1, 0.08, 0.08))
	draw_rect(Rect2(w * 0.08 - sway, h / 2.0 - 4, w * 0.22, 4), Color(0.1, 0.08, 0.08))
	# head
	var head_r := w * 0.5 + 2.0
	var head_c := Vector2(0, top + head_r)
	draw_circle(head_c, head_r, color)
	# hair
	var hair := Color(0.12, 0.09, 0.08)
	if kind == Kind.OLDEST:
		hair = Color(0.15, 0.12, 0.2)
	elif kind == Kind.STRONG:
		hair = Color(0.35, 0.18, 0.1)
	draw_arc(head_c, head_r, PI, TAU, 14, hair, head_r * 0.9)
	# big anime eyes
	var ex := facing * head_r * 0.35
	for s in [-1.0, 1.0]:
		var ep: Vector2 = head_c + Vector2(ex + s * head_r * 0.42, head_r * 0.15)
		draw_circle(ep, head_r * 0.28, Color(0.05, 0.05, 0.1))
		draw_circle(ep + Vector2(-1, -1.5), head_r * 0.1, Color(1, 1, 1))
	if kind == Kind.SMALL and hum_t > 0.0:
		draw_string(ThemeDB.fallback_font, Vector2(8, top - 4), "♪", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 0.9, 0.6))
	if active:
		var bob := sin(Time.get_ticks_msec() / 200.0) * 2.0
		draw_colored_polygon(PackedVector2Array([Vector2(-5, top - 14 + bob), Vector2(5, top - 14 + bob), Vector2(0, top - 6 + bob)]), Color(1, 0.9, 0.5))
