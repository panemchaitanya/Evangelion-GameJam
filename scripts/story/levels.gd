class_name Levels
extends RefCounted

static func create(id: String) -> Level:
	match id:
		_:
			return LevelTest.new()
