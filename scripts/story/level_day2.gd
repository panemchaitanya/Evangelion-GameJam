class_name LevelDay2
extends LevelAct1
## Act 2, Day 2 - The rules change. Same house, but a guest warden has arrived and her
## patrol is not a pattern. Everyone must reach the yard door.

var guest: Warden
var door: Interactable

func build() -> void:
	super.build()
	for it in get_tree().get_nodes_in_group("interactables"):
		if it.get_parent() == self:
			it.queue_free()
	mom.waypoints = [1150.0, 1850.0] as Array[float]
	mom.pauses = 1.4
	guest = Warden.make("guest", [350, 900, 1400, 2000, 2600], 600.0, "erratic")
	guest.position.x = 2800.0
	add_child(guest)
	door = Interactable.make(Vector2(2860, 600), Vector2(120, 90), "Slip out to the yard", _door, false)
	add_child(door)
	Builder.decor(self, Rect2(2800, 380, 120, 220), Color(0.22, 0.16, 0.12), -7)
	Builder.decor(self, Rect2(2812, 392, 96, 208), Color(0.12, 0.09, 0.08), -6)

func _start() -> void:
	exposure_rate = 0.6
	call_deferred("_intro")

func _intro() -> void:
	comic([
		{"r": Rect2(60, 50, 560, 300), "art": "doorway", "text": "Morning. A new warden stands in the doorway."},
		{"r": Rect2(640, 50, 580, 300), "art": "mom_eye", "say": "Sister Vesper will help me watch the house.", "who": Vector2(0.5, 0.9)},
		{"r": Rect2(60, 370, 560, 300), "art": "eyes_wide", "tone": Color(0.05, 0.05, 0.1), "say": "Her steps don't repeat."},
		{"r": Rect2(640, 370, 580, 300), "art": "black", "text": "Everything the kids had memorised stopped being true."},
	], func(): talk([
		["Oldest", "Mom is the same. Sister Vesper is not. She turns back. She stops. We can't count her."],
		["Oldest", "Tonight we go. All three of us have to reach the yard door. Together."],
	]))
	say("Everyone to the yard door (far right). Tab between kids. Don't get caught in a lantern.")

func _door(k: Kid) -> void:
	for kd in kids:
		if absf(kd.global_position.x - door.global_position.x) > 260.0:
			say("Wait for the others. All three must be near the door.")
			return
	talk([["Oldest", "Now. While the lights turn."]], func(): emit_signal("finished", "act2_night2"))
