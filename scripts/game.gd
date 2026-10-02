extends Node
## Autoload "Game": story flags and inventory shared across levels.

var items := {}
var flags := {}
var act := 1

func reset() -> void:
	items.clear()
	flags.clear()
	act = 1

func has_item(n: String) -> bool:
	return items.get(n, 0) > 0

func give(n: String, c: int = 1) -> void:
	items[n] = items.get(n, 0) + c

func flag(n: String) -> bool:
	return flags.get(n, false)

func set_flag(n: String, v: bool = true) -> void:
	flags[n] = v
