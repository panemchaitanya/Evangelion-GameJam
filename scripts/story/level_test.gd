class_name LevelTest
extends Level
## Physics lab: gap with swing-line, crate stack, searchlight. Verifies M1/M2 systems.

func build() -> void:
	bounds = Rect2(0, -300, 2600, 1200)
	Builder.block(self, Rect2(-200, 600, 1000, 300), Gfx.WOOD_DARK, false, Color(0.4, 0.28, 0.18))
	Builder.block(self, Rect2(1200, 600, 1600, 300), Gfx.WOOD_DARK, false, Color(0.4, 0.28, 0.18))
	Builder.block(self, Rect2(-200, -300, 200, 1200), Gfx.WALL, false)
	Builder.block(self, Rect2(2600, -300, 200, 1200), Gfx.WALL, false)
	Builder.point_light(self, Vector2(300, 400), Gfx.AMBER, 3.0, 2.2, true)
	var rope := Rope.make(Vector2(1000, 150), 12)
	add_child(rope)
	for i in 3:
		add_child(Crate.make(Vector2(550, 576 - i * 49)))
	var sl := Searchlight.new()
	add_child(sl)
	sl.setup(Vector2(1900, 80), PI / 2.0, 0.55, 0.7)
	add_kid(Kid.Kind.SMALL, Vector2(250, 560))
	add_kid(Kid.Kind.STRONG, Vector2(330, 560))
	add_kid(Kid.Kind.OLDEST, Vector2(410, 560))
