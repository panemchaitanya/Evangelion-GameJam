class_name LevelFinale
extends Level
## Finale - The Wall. One swing-line over the gap. The Small One goes last.
## Mom confronts them. The lullaby ends it. Scripted beat on top of the same rope physics.

const GAP_L := 840.0
const GAP_R := 1200.0
var rope: Rope
var mom: Warden
var crossed := {}
var mom_event := false
var phase := 0   # 0 crossing, 1 confrontation, 2 mom helps, 3 done
var post: Interactable
var assist_t := 0.0

func build() -> void:
	bounds = Rect2(0, -300, 2000, 1100)
	ambient = Color(0.17, 0.21, 0.40)
	Builder.block(self, Rect2(-100, 600, 760, 300), Color(0.30, 0.30, 0.34), false, Color(0.38, 0.40, 0.46))
	Builder.block(self, Rect2(560, 550, 100, 50), Color(0.28, 0.28, 0.32), false, Color(0.38, 0.40, 0.46))
	Builder.block(self, Rect2(660, 500, 180, 400), Color(0.28, 0.28, 0.32), false, Color(0.38, 0.40, 0.46))
	Builder.block(self, Rect2(1200, 500, 700, 400), Color(0.28, 0.28, 0.32), false, Color(0.40, 0.44, 0.52))
	Builder.block(self, Rect2(-200, -300, 200, 1200), Gfx.WALL, false)
	Builder.block(self, Rect2(1900, -300, 200, 1200), Gfx.WALL, false)
	Builder.decor(self, Rect2(0, -300, 2000, 900), Color(0.08, 0.11, 0.25), -30)
	for i in 30:
		Builder.decor(self, Rect2(30 + i * 66, -250 + (i * 41) % 380, 3, 3), Color(1, 1, 1, 0.85), -29)
	# the great wall (visual): gap is the pit between the ledges
	Builder.decor(self, Rect2(GAP_L, 620, GAP_R - GAP_L, 300), Color(0.02, 0.02, 0.04), -3)
	# gantry the rope hangs from
	Builder.decor(self, Rect2(780, 240, 480, 10), Color(0.04, 0.04, 0.07), -2)
	Builder.decor(self, Rect2(780, 240, 10, 270), Color(0.04, 0.04, 0.07), -2)
	Builder.decor(self, Rect2(1250, 240, 10, 270), Color(0.04, 0.04, 0.07), -2)
	rope = Rope.make(Vector2(1020, 250), 18)
	add_child(rope)
	# the far side: the first light on their side is reserved for Mom's doorway (warm), blue is the world
	Builder.point_light(self, Vector2(1700, 300), Gfx.BLUE, 5.0, 1.0, false)
	Builder.point_light(self, Vector2(300, 420), Gfx.AMBER, 2.4, 0.9, false)
	Builder.decor(self, Rect2(180, 260, 90, 340), Color(0.22, 0.16, 0.12), -7)  # the house door, far left
	Builder.decor(self, Rect2(190, 272, 70, 328), Color(1.0, 0.8, 0.5), -6)
	# kids start in the yard
	add_kid(Kid.Kind.OLDEST, Vector2(380, 560))
	add_kid(Kid.Kind.STRONG, Vector2(320, 560))
	add_kid(Kid.Kind.SMALL, Vector2(450, 560))
	# Mom: scripted, hidden until the confrontation
	mom = Warden.make("mom", [100.0], 600.0, "routine")
	mom.scripted = true
	mom.position = Vector2(-60, 600)
	mom.set_enabled(false)
	add_child(mom)
	post = Interactable.make(Vector2(800, 500), Vector2(150, 90), "Haul the line toward you", func(k): _haul(), false)
	add_child(post)

func _ready() -> void:
	super._ready()
	exposure_rate = 0.0
	stealth_on = false
	Music.ambience(0.1, true)
	for k in kids:
		k.mass = k.mass  # keep
	call_deferred("_intro")

func _intro() -> void:
	talk([
		["Oldest", "That's the wall. One line across. We go one at a time."],
		["Oldest", "Stand on the ledge and haul the line toward you. When it swings close, grab it with E. A and D to swing. Space to let go over the far side."],
		["Strong One", "Small goes last. He's lightest. If it goes wrong, he's the one who swings farthest."],
	])
	say("Haul the line (E at the post), grab it (E), swing (A/D), let go (Space) over the far ledge.")

func can_grab(k: Kid) -> bool:
	if k.kind == Kid.Kind.SMALL and phase == 0:
		return crossed.size() >= 2
	return true

func _haul() -> void:
	if rope.holder == null:
		rope.pull(-1.0, 520.0)
		Sfx.blip(160.0, 0.08, 0.12, 1)

func _physics_process(delta: float) -> void:
	super._physics_process(delta)
	for k in kids:
		if not crossed.has(k.kind) and k.global_position.x > GAP_R + 40.0 and k.global_position.y < 540.0:
			crossed[k.kind] = true
			Sfx.blip(780.0, 0.15, 0.15)
			if crossed.size() == 2 and phase == 0 and not mom_event:
				mom_event = true
				_mom_arrives()
			elif crossed.size() == 3 and phase == 2:
				_ending()
	if phase == 2 and rope.holder == null:
		assist_t += delta
		if assist_t > 1.4:
			assist_t = 0.0
			rope.pull(-1.0, 520.0)  # Mom hauls the line to Small
	if phase == 0 and rope.holder == null:
		pass

func _small() -> Kid:
	for k in kids:
		if k.kind == Kid.Kind.SMALL:
			return k
	return null

func _mom_arrives() -> void:
	phase = 1
	var sm := _small()
	if sm.holding != null:
		(sm.holding as Rope).release()
	locked = true
	mom.set_enabled(true)
	mom.position = Vector2(maxf(sm.global_position.x - 520.0, -40.0), 600)
	Sfx.blip(90.0, 0.4, 0.25, 2)
	var tw := create_tween()
	tw.tween_property(mom, "position:x", minf(sm.global_position.x - 70.0, 740.0), 1.6)
	tw.tween_callback(_confront)

func _confront() -> void:
	var sm := _small()
	var dk := Color(0.05, 0.05, 0.1)
	mom.dir = 1.0
	sm.global_position = Vector2(mom.position.x + 90.0, sm.global_position.y)
	sm.linear_velocity = Vector2.ZERO
	var after_talk := func():
		comic([
			{"r": Rect2(60, 50, 560, 300), "art": "mom_eye", "text": "Mom. She has kept every one of them alive, for her own reasons.", "say": "Back to bed. Now."},
			{"r": Rect2(640, 50, 580, 300), "art": "eyes_wide", "tone": dk, "who": Vector2(0.5, 0.9), "say": "I won't."},
			{"r": Rect2(60, 370, 560, 300), "art": "lullaby", "text": "He is afraid. He hums. He has always hummed it."},
			{"r": Rect2(640, 370, 580, 300), "art": "mom_eye", "text": "Mom's hand stops. It is her song.", "say": "Where did you learn that?", "who": Vector2(0.5, 0.88)},
		], _after_reveal)
	Music.lullaby(0.55, 0.5)
	talk([
		["Mom", "Three beds empty. I knew it the moment the lanterns went out."],
		["Mom", "Do you know what the gate is? I do. I have put twelve years of children through it."],
		["Mom", "You, little one. Come here. I will make this quick."],
		["Small One", "(he hums, without meaning to)"],
	], after_talk)
	sm.hum_t = 8.0

func _after_reveal() -> void:
	phase = 2
	talk([
		["Mom", "I sang that. To a baby. Before they took her to the house."],
		["Mom", "I never knew which one. I'm so sorry."],
		["Mom", "Go. Go, before the lights turn. I'll hold the line."],
	], func():
		mom.lamp.set_enabled(false)
		mom.dir = 1.0
		var tw := create_tween()
		tw.tween_property(mom, "position:x", 780.0, 1.2)
		say("Mom is hauling the line. Grab it with E. Swing. Space to let go.")
		rope.pull(-1.0, 520.0))

func _ending() -> void:
	phase = 3
	locked = true
	Music.lullaby(0.6, 0.55)
	comic([
		{"r": Rect2(60, 50, 700, 320), "art": "rope_hand", "text": "Mom's hand on the rope. She could cut it. She doesn't."},
		{"r": Rect2(780, 50, 440, 320), "art": "doorway", "text": "The doorway light behind her. The first light on their side."},
		{"r": Rect2(60, 390, 560, 280), "art": "wall_cross", "text": "One by one. The last one hums."},
		{"r": Rect2(640, 390, 580, 280), "art": "lullaby", "text": "The song carries across the wall. Part 1 ends here."},
	], func(): emit_signal("finished", "credits"))
