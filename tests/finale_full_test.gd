extends SceneTree
## Full finale: Oldest and Strong cross, Mom confrontation plays, Small crosses with Mom's help, credits transition.
var lvl
var fails := 0
func wait(s: float) -> void:
	await create_timer(s).timeout
func check(n: String, ok: bool, i: String = "") -> void:
	print(("PASS " if ok else "FAIL ") + n + " " + i)
	if not ok: fails += 1
func ev() -> InputEventAction:
	var e := InputEventAction.new(); e.action = "interact"; e.pressed = true
	return e
func advance_ui(max_n: int = 40) -> void:
	for i in max_n:
		if lvl.dialogue.active:
			lvl.dialogue._unhandled_input(ev())
		elif lvl.manga.active:
			lvl.manga.wait_t = 0.0
			lvl.manga._unhandled_input(ev())
		else:
			break
		await wait(0.05)
func cross(idx: int, limit_s: float = 25.0) -> bool:
	var k = lvl.kids[idx]
	lvl.switch_to(idx)
	k.global_position = Vector2(815, 470); k.linear_velocity = Vector2.ZERO
	await wait(0.4)
	var grabbed := false
	var t0 := Time.get_ticks_msec()
	while not grabbed and (Time.get_ticks_msec() - t0) < limit_s * 1000.0:
		lvl._haul()
		for i in 25:
			await wait(0.04)
			if lvl.rope.grab(k):
				grabbed = true
				break
		if not grabbed: await wait(1.8)
	if not grabbed: return false
	for i in 1500:
		var vx: float = k.linear_velocity.x
		Input.action_release("move_right"); Input.action_release("move_left")
		if absf(vx) > 5.0: Input.action_press("move_right" if vx > 0 else "move_left")
		else: Input.action_press("move_right")
		await wait(0.016)
		if k.holding != null and k.global_position.x > 1150.0 and k.linear_velocity.x > 0.0 and k.global_position.y < 545.0:
			lvl.rope.release(Vector2(k.facing * 160.0, -240.0))
			break
	Input.action_release("move_right"); Input.action_release("move_left")
	await wait(1.6)
	return k.global_position.x > 1220.0 and k.global_position.y < 575.0
func _initialize() -> void:
	lvl = load("res://scripts/story/level_finale.gd").new()
	root.add_child(lvl)
	await wait(0.6)
	await advance_ui()
	var finished := [""]
	lvl.finished.connect(func(n): finished[0] = n)
	# kids[0]=Oldest, [1]=Strong, [2]=Small
	check("small cannot grab early", not lvl.can_grab(lvl.kids[2]))
	check("oldest crosses", await cross(0))
	check("strong crosses", await cross(1), str(lvl.kids[1].global_position))
	await wait(0.5)
	check("mom event started", lvl.phase == 1, str(lvl.phase))
	for i in 12:
		await wait(0.7)
		await advance_ui()
		if lvl.phase >= 2: break
	check("mom scene reaches help phase", lvl.phase == 2, str(lvl.phase))
	await advance_ui()
	var sm = lvl.kids[2]
	check("small can grab now", lvl.can_grab(sm))
	lvl.locked = false
	var ok: bool = await cross(2, 40.0)
	check("small crosses", ok, str(sm.global_position))
	await wait(0.5)
	check("ending triggered", lvl.phase == 3, str(lvl.phase))
	await advance_ui(60)
	await wait(0.5)
	check("goes to credits", finished[0] == "credits", finished[0])
	print("RESULT fails=", fails)
	quit(fails)
