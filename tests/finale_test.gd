extends SceneTree
## Finale rig test: can the Oldest haul the line, grab it, swing across and land on the far ledge?
func wait(s: float) -> void:
	await create_timer(s).timeout
func _initialize() -> void:
	var lvl = load("res://scripts/story/level_finale.gd").new()
	root.add_child(lvl)
	await wait(0.6)
	lvl.dialogue.active = false; lvl.locked = false
	var k = lvl.kids[0]
	lvl.switch_to(0)
	k.global_position = Vector2(815, 470); k.linear_velocity = Vector2.ZERO
	await wait(0.5)
	print("on ledge y=", k.global_position.y, " ground=", k.on_ground)
	var grabbed := false
	for attempt in 14:
		lvl._haul()
		for i in 25:
			await wait(0.04)
			if lvl.rope.grab(k):
				grabbed = true
				break
		if grabbed: break
		await wait(1.8)
	print("grabbed=", grabbed, " pos=", k.global_position)
	if not grabbed:
		print("RESULT FAIL no grab"); quit(1); return
	var landed := false
	for i in 1500:
		var vx: float = k.linear_velocity.x
		Input.action_release("move_right"); Input.action_release("move_left")
		if absf(vx) > 5.0: Input.action_press("move_right" if vx > 0 else "move_left")
		else: Input.action_press("move_right")
		await wait(0.016)
		if k.holding != null and k.global_position.x > 1150.0 and k.linear_velocity.x > 0.0 and k.global_position.y < 495.0:
			lvl.rope.release(Vector2(k.facing * 160.0, -240.0))
			Input.action_release("move_right"); Input.action_release("move_left")
			print("released at ", k.global_position, " v=", k.linear_velocity)
			break
	await wait(1.5)
	print("final pos=", k.global_position, " crossed=", lvl.crossed)
	var ok: bool = k.global_position.x > 1220.0 and k.global_position.y < 540.0
	print("RESULT ", "PASS" if ok else "FAIL")
	quit(0 if ok else 1)
