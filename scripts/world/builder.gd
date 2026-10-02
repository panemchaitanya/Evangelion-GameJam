class_name Builder
extends RefCounted
## Helpers that build level geometry in code: bodies, lights, occluders.

const L_WORLD := 1
const L_KID := 2
const L_PROP := 4

static func rect_poly(r: Rect2) -> PackedVector2Array:
	return PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])

## Static solid block (floor, wall, ledge) with visuals and light occluder.
static func block(parent: Node, r: Rect2, color: Color = Gfx.WALL, occlude: bool = true, top_color: Color = Color(0, 0, 0, 0)) -> StaticBody2D:
	var b := StaticBody2D.new()
	b.collision_layer = L_WORLD
	b.collision_mask = 0
	b.position = r.position + r.size / 2.0
	var cs := CollisionShape2D.new()
	var sh := RectangleShape2D.new()
	sh.size = r.size
	cs.shape = sh
	b.add_child(cs)
	var p := Polygon2D.new()
	p.polygon = rect_poly(Rect2(-r.size / 2.0, r.size))
	p.color = color
	b.add_child(p)
	if top_color.a > 0.0:
		var t := Polygon2D.new()
		t.polygon = rect_poly(Rect2(-r.size.x / 2.0, -r.size.y / 2.0, r.size.x, minf(6.0, r.size.y)))
		t.color = top_color
		b.add_child(t)
	if occlude:
		var o := LightOccluder2D.new()
		var op := OccluderPolygon2D.new()
		op.polygon = rect_poly(Rect2(-r.size / 2.0, r.size))
		o.occluder = op
		b.add_child(o)
	parent.add_child(b)
	return b

static func point_light(parent: Node, pos: Vector2, color: Color, scale_f: float, energy: float, shadows: bool = true) -> PointLight2D:
	var l := PointLight2D.new()
	l.texture = Gfx.radial()
	l.position = pos
	l.color = color
	l.energy = energy
	l.texture_scale = scale_f
	l.shadow_enabled = shadows
	parent.add_child(l)
	return l

static func label(parent: Node, text: String, pos: Vector2, size: int = 18, color: Color = Color(1, 1, 1, 0.8)) -> Label:
	var l := Label.new()
	l.text = text
	l.position = pos
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.light_mask = 2  # unaffected by scene lights (lights use mask 1)
	parent.add_child(l)
	return l
