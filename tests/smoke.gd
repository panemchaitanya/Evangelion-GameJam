extends SceneTree
## Headless physics/logic smoke test:  godot --headless --path . -s tests/smoke.gd

var fails := 0
func check(name: String, ok: bool, info: String = "") -> void:
	print(("PASS " if ok else "FAIL ") + name + " " + info)
	if not ok: fails += 1

func wait(s: float) -> void:
	await create_timer(s).timeout

func _initialize() -> void:
	var main: Node = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await wait(1.2)
	var lv: Level = main.level
	var small := lv.kids[0]; var strong := lv.kids[1]
	check("3 kids spawned", lv.kids.size() == 3)
	check("small grounded", small.on_ground)
	# walk
	var x0 := small.global_position.x
	Input.action_press("move_right"); await wait(0.8); Input.action_release("move_right")
	check("small walks", small.global_position.x > x0 + 60, str(small.global_position.x - x0))
	# crates: small cannot push
	var crate: Crate = lv.get_tree().get_nodes_in_group("crates")[0]
	var cx := crate.global_position.x
	small.global_position = Vector2(cx - 60, 560); small.linear_velocity = Vector2.ZERO
	await wait(0.3)
	Input.action_press("move_right"); await wait(1.2); Input.action_release("move_right")
	check("small can't move crate", absf(crate.global_position.x - cx) < 4.0, str(crate.global_position.x - cx))
	# strong can push (crates are stacked; push bottom one)
	var bottom: Crate = null
	for c in lv.get_tree().get_nodes_in_group("crates"):
		if bottom == null or c.global_position.y > bottom.global_position.y: bottom = c
	var bx := bottom.global_position.x
	lv.switch_to(1)
	strong.global_position = Vector2(bx - 70, 555); strong.linear_velocity = Vector2.ZERO
	await wait(0.3)
	Input.action_press("move_right"); await wait(1.2); Input.action_release("move_right")
	check("strong pushes crate", bottom.global_position.x > bx + 20, str(bottom.global_position.x - bx))
	# rope grab and swing
	lv.switch_to(0)
	var rope: Rope = lv.get_tree().get_nodes_in_group("ropes")[0]
	small.global_position = Vector2(900, 560); small.linear_velocity = Vector2.ZERO
	await wait(0.5)
	small.global_position = Vector2(995, 300); small.linear_velocity = Vector2.ZERO
	var grabbed := rope.grab(small)
	check("rope grab", grabbed)
	var minx := 9999.0; var maxx := -9999.0
	for i in 400:
		var vx := small.linear_velocity.x
		Input.action_release("move_right"); Input.action_release("move_left")
		if absf(vx) > 5.0: Input.action_press("move_right" if vx > 0 else "move_left")
		elif i < 5: Input.action_press("move_right")
		await wait(0.016)
		minx = minf(minx, small.global_position.x); maxx = maxf(maxx, small.global_position.x)
	Input.action_release("move_right"); Input.action_release("move_left")
	print("swing range ", minx, " .. ", maxx)
	check("swing amplitude grows", maxx - minx > 80.0)
	check("no physics explosion", absf(small.global_position.x) < 3000.0 and absf(small.global_position.y) < 2000.0)
	rope.release(Vector2(150, -200))
	# exposure: put kid in searchlight
	var sl: Searchlight = lv.get_tree().get_nodes_in_group("danger_lights")[0]
	lv.exposure = 0.0
	small.global_position = sl.global_position + Vector2(0, 300); small.linear_velocity = Vector2.ZERO
	sl.base_angle = PI / 2.0; sl.sweep = 0.0
	await wait(0.6)
	check("exposure rises in light", lv.exposure > 0.1 or lv.ended, str(lv.exposure))
	print("RESULT fails=", fails)
	quit(fails)
