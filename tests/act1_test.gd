extends SceneTree
## Scripted playthrough of Act 1: gather items, sleep, expect transition to act2_gate.
var fails := 0
func check(n: String, ok: bool, i: String = "") -> void:
	print(("PASS " if ok else "FAIL ") + n + " " + i)
	if not ok: fails += 1
func wait(s: float) -> void:
	await create_timer(s).timeout
func _initialize() -> void:
	var main: Node = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await wait(0.8)
	var lv: Level = main.level
	check("act1 loaded", lv is LevelAct1)
	check("intro dialogue locks input", lv.locked)
	# advance dialogue
	for i in 12:
		var ev := InputEventAction.new(); ev.action = "interact"; ev.pressed = true
		Input.parse_input_event(ev)
		await wait(0.15)
		var ev2 := InputEventAction.new(); ev2.action = "interact"; ev2.pressed = false
		Input.parse_input_event(ev2)
		await wait(0.1)
	check("dialogue finished", not lv.locked)
	var a1 := lv as LevelAct1
	a1.mom.set_enabled(false)
	var its := lv.get_tree().get_nodes_in_group("interactables")
	check("interactables exist", its.size() >= 4, str(its.size()))
	var oldest := lv.kids[2]
	lv.switch_to(2)
	for it in its:
		if it.prompt.begins_with("Go to bed"): continue
		oldest.global_position = it.global_position + Vector2(0, -30)
		oldest.linear_velocity = Vector2.ZERO
		await wait(0.2)
		check("can use " + it.prompt, it.can_use(oldest))
		it.use(oldest)
		await wait(0.1)
		# dismiss any dialogue
		for j in 4:
			if lv.locked:
				lv.dialogue._unhandled_input(_act("interact"))
				await wait(0.1)
	check("all items", a1.got.values().all(func(v): return v))
	var got_next := [""]
	lv.finished.connect(func(n): got_next[0] = n)
	a1.sleep_spot.use(oldest)
	await wait(0.2)
	for j in 10:
		if lv.locked:
			lv.dialogue._unhandled_input(_act("interact"))
			await wait(0.15)
	check("sleep -> act2_gate", got_next[0] == "act2_gate", got_next[0])
	# Mom's lantern lights a kid -> exposure
	a1.mom.set_enabled(true)
	print("RESULT fails=", fails)
	quit(fails)
func _act(a: String) -> InputEventAction:
	var e := InputEventAction.new(); e.action = a; e.pressed = true
	return e
