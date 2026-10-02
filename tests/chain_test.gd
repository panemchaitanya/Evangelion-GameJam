extends SceneTree
## Full level chain by script (teleport + use interactables): title -> act1 -> act2_gate -> day2 -> night2 -> finale -> credits -> title.
var main
var fails := 0
func wait(s: float) -> void:
	await create_timer(s).timeout
func ev() -> InputEventAction:
	var e := InputEventAction.new(); e.action = "interact"; e.pressed = true
	return e
func advance_ui() -> void:
	for i in 60:
		var lv = main.level
		if lv.dialogue.active: lv.dialogue._unhandled_input(ev())
		elif lv.manga.active:
			lv.manga.wait_t = 0.0
			lv.manga._unhandled_input(ev())
		else: break
		await wait(0.04)
func check(n: String, ok: bool, i: String = "") -> void:
	print(("PASS " if ok else "FAIL ") + n + " " + i)
	if not ok: fails += 1
func wait_level(id: String) -> void:
	for i in 100:
		await wait(0.1)
		if main.level_id == id and main.level != null and is_instance_valid(main.level): return
func use_all(lv, kid_idx: int) -> void:
	var k = lv.kids[kid_idx]
	for it in lv.get_tree().get_nodes_in_group("interactables"):
		if not is_instance_valid(lv) or main.level != lv: return
		if it.get_parent() != lv or not it.enabled: continue
		k.global_position = it.global_position + Vector2(0, -30); k.linear_velocity = Vector2.ZERO
		await wait(0.15)
		if it.can_use(k): it.use(k)
		await wait(0.1)
		await advance_ui()
func _initialize() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await wait(0.6)
	check("starts at title", main.level_id == "title")
	main.level._unhandled_input(ev())
	await wait_level("act1")
	check("title -> act1", main.level_id == "act1")
	await wait(0.4); await advance_ui()
	main.level.mom.set_enabled(false)
	await use_all(main.level, 2)
	await wait_level("act2_gate")
	check("act1 -> act2_gate", main.level_id == "act2_gate")
	await wait(0.4); await advance_ui()
	main.level.night_warden.set_enabled(false)
	for l in main.level.get_tree().get_nodes_in_group("danger_lights"): l.set_enabled(false)
	await use_all(main.level, 2)
	await wait_level("act2_day2")
	check("gate -> day2", main.level_id == "act2_day2")
	await wait(0.4); await advance_ui()
	var d2 = main.level
	d2.mom.set_enabled(false); d2.guest.set_enabled(false)
	for kd in d2.kids: kd.global_position = d2.door.global_position + Vector2(-60, -30)
	await wait(0.3)
	d2.door.use(d2.kids[0])
	await wait(0.2); await advance_ui()
	await wait_level("act2_night2")
	check("day2 -> night2", main.level_id == "act2_night2")
	await wait(0.4); await advance_ui()
	var n2 = main.level
	for l in n2.get_tree().get_nodes_in_group("danger_lights"): l.set_enabled(false)
	for kd in n2.kids: kd.global_position = Vector2(3400, 560)
	await wait(0.4)
	for it in n2.get_tree().get_nodes_in_group("interactables"):
		if it.get_parent() == n2: it.use(n2.kids[0])
	await wait_level("finale")
	check("night2 -> finale", main.level_id == "finale")
	# finale logic is covered by finale_full_test; jump to credits
	main.level.emit_signal("finished", "credits")
	await wait_level("credits")
	check("finale -> credits", main.level_id == "credits")
	main.level.scroll_y = -1100.0
	await wait(0.3)
	main.level._unhandled_input(ev())
	await wait_level("title")
	check("credits -> title", main.level_id == "title")
	print("RESULT fails=", fails)
	quit(fails)
