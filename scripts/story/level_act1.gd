class_name LevelAct1
extends Level
## Act 1 - The Lie. A warm day in the house. Gather rope, plank, pulley without drawing Mom's eye.

var mom: Warden
var got := {"rope": false, "plank": false, "pulley": false}
var sleep_spot: Interactable
var told_intro := false

func build() -> void:
	bounds = Rect2(0, -100, 3000, 900)
	ambient = Color(0.42, 0.38, 0.46)
	var floor_r := Rect2(-100, 600, 3200, 300)
	Builder.block(self, floor_r, Gfx.WOOD_DARK, false, Color(0.55, 0.38, 0.24))
	Builder.block(self, Rect2(-200, -100, 200, 800), Gfx.WALL, false)
	Builder.block(self, Rect2(3000, -100, 200, 800), Gfx.WALL, false)
	# rooms
	Builder.wallpaper(self, Rect2(0, 130, 1000, 470), Color(0.50, 0.38, 0.34), Color(0.44, 0.33, 0.30))
	Builder.wallpaper(self, Rect2(1000, 130, 900, 470), Color(0.46, 0.40, 0.30), Color(0.40, 0.34, 0.26))
	Builder.wallpaper(self, Rect2(1900, 130, 1100, 470), Color(0.40, 0.42, 0.40), Color(0.35, 0.37, 0.35))
	Builder.decor(self, Rect2(0, 120, 3000, 14), Color(0.20, 0.14, 0.10), -9)  # ceiling beam
	for x in [1000, 1900]:
		Builder.decor(self, Rect2(x - 6, 130, 12, 470), Color(0.22, 0.16, 0.12), -8)
	# dorm
	for i in 3:
		Builder.bed(self, Vector2(160 + i * 250, 600))
	Builder.window(self, Vector2(420, 330))
	Builder.window(self, Vector2(820, 330))
	Builder.lamp_prop(self, Vector2(60, 600))
	Builder.lamp_prop(self, Vector2(920, 600))
	# hall
	Builder.lamp_prop(self, Vector2(1450, 600), 1.3)
	Builder.decor(self, Rect2(1180, 260, 70, 90), Color(0.28, 0.2, 0.16), -12)  # portraits
	Builder.decor(self, Rect2(1190, 270, 50, 70), Color(0.6, 0.55, 0.45), -11)
	Builder.decor(self, Rect2(1640, 260, 70, 90), Color(0.28, 0.2, 0.16), -12)
	Builder.decor(self, Rect2(1650, 270, 50, 70), Color(0.55, 0.5, 0.42), -11)
	# kitchen shelf (pulley) needs a crate stack
	Builder.block(self, Rect2(1560, 470, 200, 14), Gfx.WOOD, false, Color(0.5, 0.36, 0.22))
	add_child(Crate.make(Vector2(1400, 576)))
	# laundry
	Builder.lamp_prop(self, Vector2(2300, 600), 1.5)
	Builder.window(self, Vector2(2600, 330))
	var line_rope := Rope.make(Vector2(2100, 150), 12)
	add_child(line_rope)
	Builder.decor(self, Rect2(2060, 142, 12, 12), Color(0.3, 0.3, 0.33), 1)
	add_child(Crate.make(Vector2(2450, 576)))
	add_child(Crate.make(Vector2(2450, 527)))
	# kids
	add_kid(Kid.Kind.SMALL, Vector2(200, 560))
	add_kid(Kid.Kind.STRONG, Vector2(280, 560))
	add_kid(Kid.Kind.OLDEST, Vector2(360, 560))
	# warden (routine = learnable)
	mom = Warden.make("mom", [1150, 1850, 1850, 1150], 600.0, "routine")
	add_child(mom)
	for c in get_tree().get_nodes_in_group("crates"):
		pass
	# interactables
	_add_item(Vector2(2270, 600), "rope", "Take the laundry rope")
	_add_item(Vector2(700, 600), "plank", "Pry a loose plank from the bed frame")
	var pulley := Interactable.make(Vector2(1660, 484), Vector2(70, 60), "Take the pulley", func(k): _collect("pulley"), true)
	add_child(pulley)
	sleep_spot = Interactable.make(Vector2(160, 600), Vector2(120, 70), "Go to bed", _sleep, false)
	sleep_spot.enabled = false
	add_child(sleep_spot)
	Sfx.blip(220.0, 0.1, 0.05)

func _ready() -> void:
	super._ready()
	_start()

func _start() -> void:
	exposure_rate = 0.5
	say("Morning. Conny leaves for his new family tonight. Find something to give him.")
	call_deferred("_intro")

func _intro() -> void:
	talk([
		["Oldest", "Conny's turn today. Twelve. Mom says a family is waiting for him."],
		["Oldest", "Let's make him a send-off gift. Rope, a plank, a pulley. We can lower a basket from the window."],
		["Small One", "Mom is in the hall. Count her steps. She always goes the same way."],
		["", "A/D to move, Tab to swap kids, E to use things. Stay out of Mom's lantern light."],
	])

func _add_item(pos: Vector2, id: String, text: String) -> void:
	var it := Interactable.make(pos, Vector2(70, 70), text, func(k): _collect(id), true)
	add_child(it)

func _collect(id: String) -> void:
	if got[id]:
		return
	got[id] = true
	Game.give(id)
	Sfx.blip(520.0, 0.12, 0.15)
	var n := 0
	for v in got.values():
		if v: n += 1
	say("Collected %s  (%d / 3)" % [id, n])
	if n == 3:
		sleep_spot.enabled = true
		talk([["Oldest", "That's everything. Back to the dorm - it's nearly bedtime."]])

func _sleep(k: Kid) -> void:
	talk([
		["", "Lights out. Conny's bed is empty. Everyone clapped when the gate closed behind him."],
		["", "In the dark, the Small One hums a tune. Nobody knows where it comes from."],
		["Small One", "..."],
		["Oldest", "Wait. Conny left his rabbit. He'll want it."],
	], func(): emit_signal("finished", "act2_gate"))
	for kd in kids:
		if kd.kind == Kid.Kind.SMALL:
			kd.hum_t = 6.0
	Music.lullaby(0.5)
