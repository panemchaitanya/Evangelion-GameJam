class_name Searchlight
extends Node2D
## Cold blue sweeping cone. Same geometry drives visuals (PointLight2D) and gameplay (is_lit).

var reach := 420.0
var half_angle := 0.28
var base_angle := PI / 2.0
var sweep := 0.7
var speed := 0.6
var phase := 0.0
var light: PointLight2D
var enabled := true
var _t := 0.0

func setup(pos: Vector2, base: float, sweep_amt: float, spd: float, ph: float = 0.0, r: float = 420.0, ha: float = 0.28) -> Searchlight:
	position = pos
	base_angle = base
	sweep = sweep_amt
	speed = spd
	phase = ph
	reach = r
	half_angle = ha
	light = PointLight2D.new()
	light.texture = Gfx.cone(half_angle)
	light.texture_scale = reach / 256.0
	light.color = Gfx.BLUE
	light.energy = 1.5
	light.shadow_enabled = true
	add_child(light)
	add_to_group("danger_lights")
	_t = phase
	_apply()
	return self

func _apply() -> void:
	rotation = base_angle + sin(_t * speed) * sweep

func _physics_process(delta: float) -> void:
	_t += delta
	_apply()

func set_enabled(e: bool) -> void:
	enabled = e
	light.enabled = e

func is_lit(p: Vector2) -> bool:
	if not enabled:
		return false
	var v := p - global_position
	if v.length() > reach:
		return false
	var d := absf(angle_difference(rotation, v.angle()))
	if d > half_angle:
		return false
	var q := PhysicsRayQueryParameters2D.create(global_position, p)
	q.collision_mask = Builder.L_WORLD | Builder.L_PROP
	return get_world_2d().direct_space_state.intersect_ray(q).is_empty()
