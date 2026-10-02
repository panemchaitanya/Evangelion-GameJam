class_name LevelNight2
extends Level
## Act 2, Night 2 - The yard again, with Sister Vesper. Reach the wall.

var guest: Warden

func build() -> void:
	bounds = Rect2(0, -200, 3800, 1000)
	ambient = Color(0.18, 0.22, 0.40)
	Builder.block(self, Rect2(-100, 600, 4000, 300), Color(0.30, 0.30, 0.34), false, Color(0.38, 0.40, 0.46))
	Builder.block(self, Rect2(-200, -200, 200, 900), Gfx.WALL, false)
	Builder.block(self, Rect2(3800, -200, 200, 900), Gfx.WALL, false)
	Builder.decor(self, Rect2(0, -200, 3800, 800), Color(0.09, 0.12, 0.26), -30)
	for i in 44:
		Builder.decor(self, Rect2(60 + i * 87, -140 + (i * 47) % 320, 3, 3), Color(1, 1, 1, 0.8), -29)
	Builder.decor(self, Rect2(-100, 200, 460, 400), Color(0.07, 0.05, 0.09), -12)
	Builder.point_light(self, Vector2(150, 400), Gfx.AMBER, 3.0, 1.0, false)
	# cover crates and a fence needing a stack
	Builder.block(self, Rect2(1700, 510, 24, 90), Color(0.2, 0.17, 0.15), true)
	for x in [700, 1250, 2100, 2150, 2700]:
		add_child(Crate.make(Vector2(x, 576)))
	add_child(Crate.make(Vector2(2175, 527)))
	for sx in [900, 1900, 2800]:
		Builder.decor(self, Rect2(sx - 8, 90, 16, 510), Color(0.05, 0.05, 0.08), -5)
	var a := Searchlight.new(); add_child(a); a.setup(Vector2(900, 90), PI / 2.0, 0.6, 0.8, 0.0, 540.0, 0.22)
	var b := Searchlight.new(); add_child(b); b.setup(Vector2(1900, 90), PI / 2.0 - 0.1, 0.6, 0.6, 2.0, 540.0, 0.22)
	var c := Searchlight.new(); add_child(c); c.setup(Vector2(2800, 90), PI / 2.0, 0.55, 0.9, 4.0, 540.0, 0.22)
	guest = Warden.make("guest", [500, 1300, 2000, 2600, 3200], 600.0, "erratic")
	guest.position.x = 1500.0
	add_child(guest)
	# the wall in the distance
	Builder.decor(self, Rect2(3600, 100, 200, 500), Color(0.05, 0.05, 0.08), -5)
	Builder.point_light(self, Vector2(3500, 380), Gfx.BLUE, 4.0, 1.0, false)
	add_kid(Kid.Kind.SMALL, Vector2(300, 560))
	add_kid(Kid.Kind.STRONG, Vector2(230, 560))
	add_kid(Kid.Kind.OLDEST, Vector2(160, 560))
	var wall := Interactable.make(Vector2(3480, 600), Vector2(160, 90), "All three at the wall - go", _wall, false)
	add_child(wall)

func _ready() -> void:
	super._ready()
	exposure_rate = 0.6
	Music.ambience(0.1, true)
	call_deferred("_intro")

func _intro() -> void:
	talk([
		["Oldest", "Sister Vesper doesn't follow a loop. Watch her lantern, not her feet."],
		["Strong One", "Crates make shadow. Put one between you and a searchlight."],
		["", "Reach the wall at the far end. All three kids, then press E."],
	])

func _wall(k: Kid) -> void:
	for kd in kids:
		if absf(kd.global_position.x - 3480.0) > 300.0:
			say("Wait for the others. All three kids must be at the wall.")
			return
	emit_signal("finished", "finale")
