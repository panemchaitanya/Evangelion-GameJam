class_name Rope
extends Node2D
## Segmented rope: RigidBody2D links joined by PinJoint2D, anchored to a static point.
## Segment count is capped for web-build stability (GDD technical risk 1).

const SEG_LEN := 18.0
var segs: Array[RigidBody2D] = []
var anchor: StaticBody2D
var holder: Kid = null
var hold_joint: PinJoint2D = null
var count := 12

static func make(top: Vector2, n: int = 12) -> Rope:
	var r := Rope.new()
	r.count = clampi(n, 4, 18)
	r.position = Vector2.ZERO
	r._build(top)
	return r

func _build(top: Vector2) -> void:
	anchor = StaticBody2D.new()
	anchor.position = top
	anchor.collision_layer = 0
	anchor.collision_mask = 0
	add_child(anchor)
	var prev: PhysicsBody2D = anchor
	for i in count:
		var s := RigidBody2D.new()
		s.position = top + Vector2(0, SEG_LEN * (i + 0.5))
		s.mass = 0.25
		s.linear_damp = 0.6
		s.angular_damp = 4.0
		s.collision_layer = 0
		s.collision_mask = 0
		var cs := CollisionShape2D.new()
		cs.shape = CapsuleShape2D.new()
		(cs.shape as CapsuleShape2D).radius = 3.0
		(cs.shape as CapsuleShape2D).height = SEG_LEN
		s.add_child(cs)
		add_child(s)
		var j := PinJoint2D.new()
		j.position = top + Vector2(0, SEG_LEN * i)
		j.softness = 0.0
		add_child(j)
		j.node_a = j.get_path_to(prev)
		j.node_b = j.get_path_to(s)
		segs.append(s)
		prev = s
	add_to_group("ropes")

func _process(_d: float) -> void:
	queue_redraw()

func _draw() -> void:
	var pts := PackedVector2Array()
	pts.append(anchor.position)
	for s in segs:
		pts.append(s.position + Vector2(0, SEG_LEN / 2.0).rotated(s.rotation))
	if pts.size() >= 2:
		draw_polyline(pts, Color(0.62, 0.5, 0.34), 4.0, true)
		draw_polyline(pts, Color(0.35, 0.27, 0.18), 1.5, true)
	draw_circle(anchor.position, 5.0, Color(0.3, 0.3, 0.33))

func nearest_segment(p: Vector2, max_d: float = 46.0) -> RigidBody2D:
	var best: RigidBody2D = null
	var bd := max_d
	for s in segs:
		var d := s.global_position.distance_to(p)
		if d < bd:
			bd = d
			best = s
	return best

func grab(k: Kid) -> bool:
	if holder != null:
		return false
	var s := nearest_segment(k.global_position + Vector2(0, -k.body_size.y * 0.3))
	if s == null:
		return false
	holder = k
	k.holding = self
	# Hands sit at the segment: put the kid there then pin.
	k.global_position = s.global_position + Vector2(0, k.body_size.y * 0.55)
	k.linear_velocity = Vector2.ZERO
	hold_joint = PinJoint2D.new()
	add_child(hold_joint)
	hold_joint.global_position = s.global_position
	hold_joint.node_a = hold_joint.get_path_to(s)
	hold_joint.node_b = hold_joint.get_path_to(k)
	hold_joint.softness = 0.0
	Sfx.blip(300.0, 0.05, 0.12, 2)
	return true

func release(boost: Vector2 = Vector2.ZERO) -> void:
	if holder == null:
		return
	var k := holder
	holder = null
	k.holding = null
	if hold_joint:
		hold_joint.queue_free()
		hold_joint = null
	k.linear_velocity += boost

func pump(dir: float, delta: float) -> void:
	if holder == null or dir == 0.0:
		return
	# Swing by pushing the kid sideways; heavier kids move the rope less per unit force.
	holder.apply_central_force(Vector2(dir * 520.0 * holder.mass, 0))

func _physics_process(delta: float) -> void:
	if holder != null:
		pump(holder.move_dir, delta)
