class_name Crate
extends RigidBody2D
## Real stackable crate. Hard impacts make noise that wardens can hear.

signal noise(pos: Vector2, loudness: float)
var size := Vector2(48, 48)
var _last_v := Vector2.ZERO
var _cool := 0.0

static func make(pos: Vector2, sz: Vector2 = Vector2(48, 48), m: float = 3.5) -> Crate:
	var c := Crate.new()
	c.size = sz
	c.position = pos
	c.mass = m
	c.collision_layer = Builder.L_PROP
	c.collision_mask = Builder.L_WORLD | Builder.L_PROP | Builder.L_KID
	c.continuous_cd = RigidBody2D.CCD_MODE_CAST_RAY
	c.contact_monitor = true
	c.max_contacts_reported = 4
	c.linear_damp = 0.4
	c.angular_damp = 1.5
	var pm := PhysicsMaterial.new()
	pm.friction = 0.6
	pm.bounce = 0.0
	c.physics_material_override = pm
	var cs := CollisionShape2D.new()
	var sh := RectangleShape2D.new()
	sh.size = sz - Vector2(1, 1)
	cs.shape = sh
	c.add_child(cs)
	var poly := Polygon2D.new()
	poly.polygon = Builder.rect_poly(Rect2(-sz / 2.0, sz))
	poly.color = Color(0.55, 0.40, 0.26)
	c.add_child(poly)
	var plank := Polygon2D.new()
	plank.polygon = Builder.rect_poly(Rect2(-sz / 2.0 + Vector2(4, 4), sz - Vector2(8, 8)))
	plank.color = Color(0.42, 0.30, 0.20)
	c.add_child(plank)
	var o := LightOccluder2D.new()
	var op := OccluderPolygon2D.new()
	op.polygon = Builder.rect_poly(Rect2(-sz / 2.0 + Vector2(2, 2), sz - Vector2(4, 4)))
	o.occluder = op
	c.add_child(o)
	c.add_to_group("crates")
	return c

func _physics_process(delta: float) -> void:
	_cool = maxf(0.0, _cool - delta)
	var dv := (linear_velocity - _last_v).length()
	if dv > 160.0 and _cool <= 0.0:
		_cool = 0.4
		emit_signal("noise", global_position, clampf(dv / 400.0, 0.2, 1.0))
		Sfx.blip(90.0, 0.18, 0.25, 1)
	_last_v = linear_velocity
