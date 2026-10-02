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

## Background rectangle: no collision, no occluder. Takes light.
static func decor(parent: Node, r: Rect2, color: Color, z: int = -10) -> Polygon2D:
	var p := Polygon2D.new()
	p.polygon = rect_poly(r)
	p.color = color
	p.z_index = z
	parent.add_child(p)
	return p

## Wallpaper stripes for interior walls.
static func wallpaper(parent: Node, r: Rect2, base: Color, stripe: Color, z: int = -20) -> void:
	decor(parent, r, base, z)
	var x := r.position.x + 20.0
	while x < r.end.x:
		decor(parent, Rect2(x, r.position.y, 8, r.size.y), stripe, z + 1)
		x += 46.0

static func window(parent: Node, pos: Vector2, night: bool = true) -> void:
	decor(parent, Rect2(pos.x - 40, pos.y - 60, 80, 120), Color(0.12, 0.09, 0.08), -15)
	decor(parent, Rect2(pos.x - 34, pos.y - 54, 68, 108), Color(0.30, 0.42, 0.65) if night else Color(0.8, 0.85, 0.9), -14)
	decor(parent, Rect2(pos.x - 2, pos.y - 54, 4, 108), Color(0.12, 0.09, 0.08), -13)
	decor(parent, Rect2(pos.x - 34, pos.y - 2, 68, 4), Color(0.12, 0.09, 0.08), -13)
	if night:
		point_light(parent, pos + Vector2(0, 60), Gfx.BLUE, 1.6, 0.8, false)

static func bed(parent: Node, pos: Vector2) -> void:
	decor(parent, Rect2(pos.x - 60, pos.y - 34, 120, 14), Color(0.38, 0.28, 0.2), -6)
	decor(parent, Rect2(pos.x - 60, pos.y - 20, 8, 20), Color(0.28, 0.2, 0.15), -6)
	decor(parent, Rect2(pos.x + 52, pos.y - 20, 8, 20), Color(0.28, 0.2, 0.15), -6)
	decor(parent, Rect2(pos.x - 56, pos.y - 44, 70, 12), Color(0.75, 0.7, 0.62), -5)
	decor(parent, Rect2(pos.x - 56, pos.y - 56, 26, 14), Color(0.85, 0.82, 0.78), -5)

static func lamp_prop(parent: Node, pos: Vector2, energy: float = 1.6) -> void:
	decor(parent, Rect2(pos.x - 2, pos.y - 20, 4, 20), Color(0.2, 0.15, 0.1), -4)
	decor(parent, Rect2(pos.x - 8, pos.y - 30, 16, 14), Color(1.0, 0.85, 0.5), 2)
	point_light(parent, pos + Vector2(0, -24), Gfx.AMBER, 2.4, energy, false)
