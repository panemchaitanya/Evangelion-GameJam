extends Node
## Procedural sound: no audio files, no licence risk. Registered as autoload "Sfx".

const RATE := 22050
var _players: Array[AudioStreamPlayer] = []
var _i := 0

func _ready() -> void:
	for n in 8:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)

func blip(freq: float, dur: float = 0.1, vol: float = 0.2, kind: int = 0) -> void:
	var n := int(RATE * dur)
	var data := PackedByteArray()
	data.resize(n * 2)
	var ph := 0.0
	for i in n:
		var t := float(i) / n
		var env := (1.0 - t) * minf(1.0, i / 200.0)
		ph += freq / RATE
		var s := 0.0
		if kind == 0:
			s = sin(ph * TAU)
		elif kind == 1:
			s = (randf() * 2.0 - 1.0)
		else:
			s = 1.0 if fmod(ph, 1.0) < 0.5 else -1.0
		var v := int(clampf(s * env * vol, -1.0, 1.0) * 32000.0)
		data.encode_s16(i * 2, v)
	var st := AudioStreamWAV.new()
	st.format = AudioStreamWAV.FORMAT_16_BITS
	st.mix_rate = RATE
	st.stereo = false
	st.data = data
	var p := _players[_i % _players.size()]
	_i += 1
	p.stream = st
	p.play()
