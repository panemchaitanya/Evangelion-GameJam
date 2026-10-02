class_name Gfx
extends RefCounted
## Procedural textures and palette. No external art, so no licence risk and tiny web build.

const AMBER := Color(1.0, 0.72, 0.38)
const BLUE := Color(0.55, 0.78, 1.0)
const NAVY := Color(0.04, 0.05, 0.10)
const WOOD := Color(0.62, 0.42, 0.27)
const WOOD_DARK := Color(0.45, 0.31, 0.21)
const WALL := Color(0.55, 0.43, 0.38)

static var _cache := {}

static func radial(size: int = 256) -> Texture2D:
	var key := "radial%d" % size
	if _cache.has(key):
		return _cache[key]
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c := size / 2.0
	for y in size:
		for x in size:
			var d := Vector2(x - c, y - c).length() / c
			var a := clampf(1.0 - d, 0.0, 1.0)
			a = a * a * (3.0 - 2.0 * a)
			img.set_pixel(x, y, Color(a, a, a, a))
	var t := ImageTexture.create_from_image(img)
	_cache[key] = t
	return t

## Cone pointing +X with apex at texture centre. half_angle in radians.
static func cone(half_angle: float, size: int = 512) -> Texture2D:
	var key := "cone%.3f_%d" % [half_angle, size]
	if _cache.has(key):
		return _cache[key]
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var c := size / 2.0
	for y in size:
		for x in size:
			var v := Vector2(x - c, y - c)
			var d := v.length() / c
			if d > 1.0 or d < 0.001:
				img.set_pixel(x, y, Color(1, 1, 1, 0))
				continue
			var ang := absf(v.angle())
			var edge := clampf(1.0 - ang / half_angle, 0.0, 1.0)
			edge = minf(edge * 4.0, 1.0)
			var fall := 1.0 - d * 0.6
			img.set_pixel(x, y, Color(edge * fall, edge * fall, edge * fall, edge * fall))
	var t := ImageTexture.create_from_image(img)
	_cache[key] = t
	return t

static func vignette_shader() -> Shader:
	var s := Shader.new()
	s.code = """
shader_type canvas_item;
uniform float amount : hint_range(0.0, 1.0) = 0.0;
uniform vec4 tint : source_color = vec4(0.35, 0.6, 1.0, 1.0);
void fragment() {
	vec2 uv = UV - vec2(0.5);
	float d = length(uv * vec2(1.0, 1.15));
	float edge = smoothstep(0.18, 0.75, d);
	COLOR = vec4(tint.rgb, edge * amount * 0.85);
}
"""
	return s
