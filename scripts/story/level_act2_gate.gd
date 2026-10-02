class_name LevelAct2Gate
extends Level
## Act 2, Night 1 - The Gate. Sneak across the yard to return Conny's rabbit. Twist one.

var night_warden: Warden
var gate_done := false

func build() -> void:
	bounds = Rect2(0, -200, 3700, 1000)
	ambient = Color(0.20, 0.24, 0.42)
	Builder.block(self, Rect2(-100, 600, 3900, 300), Color(0.30, 0.30, 0.34), false, Color(0.38, 0.40, 0.46))
	Builder.block(self, Rect2(-200, -200, 200, 900), Gfx.WALL, false)
	Builder.block(self, Rect2(3700, -200, 200, 900), Gfx.WALL, false)
	# sky
	Builder.decor(self, Rect2(0, -200, 3700, 800), Color(0.10, 0.13, 0.28), -30)
	for i in 40:
		Builder.decor(self, Rect2(80 + i * 91, -120 + (i * 53) % 300, 3, 3), Color(1, 1, 1, 0.8), -29)
	Builder.decor(self, Rect2(3000, -60, 70, 70), Color(0.8, 0.85, 1.0), -28)
	# the house (left)
	Builder.decor(self, Rect2(-100, 200, 560, 400), Color(0.07, 0.05, 0.09), -12)
	for i in 4:
		Builder.decor(self, Rect2(20 + i * 100, 300, 34, 46), Color(1.0, 0.74, 0.4), -11)
	Builder.point_light(self, Vector2(250, 380), Gfx.AMBER, 3.2, 1.2, false)
	# fence section, 90 tall: stack a crate to cross
	Builder.block(self, Rect2(1500, 510, 24, 90), Color(0.2, 0.17, 0.15), true)
	for i in 6:
		Builder.decor(self, Rect2(1494 + 0, 515 + i * 14, 36, 3), Color(0.28, 0.24, 0.2), -2)
	add_child(Crate.make(Vector2(1000, 576)))
	add_child(Crate.make(Vector2(1900, 576)))
	add_child(Crate.make(Vector2(1949, 576)))
	add_child(Crate.make(Vector2(2500, 576)))
	# searchlights on towers
	for sx in [1100, 2200, 2900]:
		Builder.decor(self, Rect2(sx - 8, 90, 16, 510), Color(0.05, 0.05, 0.08), -5)
		Builder.decor(self, Rect2(sx - 20, 76, 40, 18), Color(0.1, 0.1, 0.14), -4)
	var sl1 := Searchlight.new(); add_child(sl1)
	sl1.setup(Vector2(1100, 90), PI / 2.0 + 0.1, 0.55, 0.55, 0.0, 520.0, 0.22)
	var sl2 := Searchlight.new(); add_child(sl2)
	sl2.setup(Vector2(2200, 90), PI / 2.0, 0.6, 0.5, 1.5, 560.0, 0.22)
	var sl3 := Searchlight.new(); add_child(sl3)
	sl3.setup(Vector2(2900, 90), PI / 2.0, 0.5, 0.7, 3.0, 520.0, 0.22)
	# gate
	for gx in [3350, 3560]:
		Builder.block(self, Rect2(gx, 300, 30, 300), Color(0.05, 0.05, 0.08), false)
	Builder.decor(self, Rect2(3380, 300, 180, 12), Color(0.05, 0.05, 0.08), -3)
	for i in 8:
		Builder.decor(self, Rect2(3384 + i * 22, 310, 6, 290), Color(0.07, 0.07, 0.1), -3)
	var cold := Builder.point_light(self, Vector2(3470, 420), Gfx.BLUE, 5.0, 1.4, false)
	# warden
	night_warden = Warden.make("night", [650, 1350, 1350, 650], 600.0, "routine")
	add_child(night_warden)
	# kids
	add_kid(Kid.Kind.SMALL, Vector2(500, 560))
	add_kid(Kid.Kind.STRONG, Vector2(430, 560))
	add_kid(Kid.Kind.OLDEST, Vector2(360, 560))
	var gate := Interactable.make(Vector2(3340, 600), Vector2(120, 80), "Look through the gate", _gate_scene, true)
	add_child(gate)

func _ready() -> void:
	super._ready()
	exposure_rate = 0.55
	Music.ambience(0.1, true)
	call_deferred("_intro")

func _intro() -> void:
	talk([
		["Oldest", "Quiet. The night warden does the same loop. Searchlights sweep slower on the far side."],
		["Strong One", "There's a fence. If I push a crate over, you can climb it."],
		["Small One", "We just give the rabbit to the gate-keeper. Conny will want it."],
		["", "Tab swaps kids. The Strong One shoves crates. Searchlight light fills the edge of the screen - hide in shadow."],
	])

func _gate_scene(k: Kid) -> void:
	var dk := Color(0.05, 0.05, 0.1)
	comic([
		{"r": Rect2(60, 50, 560, 300), "art": "gate_beam", "text": "The gate. White-blue light, nothing like the house."},
		{"r": Rect2(640, 50, 580, 300), "art": "delivery", "text": "A delivery. Machines. Conny hangs among the others."},
		{"r": Rect2(60, 370, 380, 300), "art": "eyes_wide", "tone": dk, "say": "That's not a family."},
		{"r": Rect2(460, 370, 360, 300), "art": "eyes_wide", "tear": true, "tone": dk, "who": Vector2(0.5, 0.8), "say": "He's the crop. So are we."},
		{"r": Rect2(840, 370, 380, 300), "art": "black", "text": "Chores. Tests. Every meal. A grade. Nothing was for us."},
	], func(): talk([
		["Oldest", "We are livestock. The house is a farm. We leave before twelve, or we never leave."],
		["Strong One", "Then we build it. Everything we took for Conny's gift. Rope, plank, pulley."],
		["Small One", "..."],
	], func(): emit_signal("finished", "act2_day2")))
