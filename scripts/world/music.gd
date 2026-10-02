extends Node
## Autoload "Music": the lullaby motif and ambience, synthesised at runtime (no audio files).
## Motif (original): E G A G E D C D E ... a short singable rocking phrase.

const RATE := 22050
const MOTIF := [330.0, 392.0, 440.0, 392.0, 330.0, 294.0, 262.0, 294.0, 330.0, 0.0, 262.0, 294.0, 330.0, 294.0, 262.0, 0.0]
var player: AudioStreamPlayer
var amb: AudioStreamPlayer
var _streams := {}

func _ready() -> void:
	player = AudioStreamPlayer.new()
	add_child(player)
	amb = AudioStreamPlayer.new()
	add_child(amb)

func _tone(buf: PackedFloat32Array, start: int, freq: float, dur: float, vol: float, bell: bool) -> void:
	var n := int(dur * RATE)
	for i in n:
		if start + i >= buf.size():
			break
		var t := float(i) / RATE
		var env := exp(-t * (3.2 if bell else 1.4)) * minf(1.0, i / 150.0)
		var s := sin(TAU * freq * t) + 0.35 * sin(TAU * freq * 2.0 * t) + 0.12 * sin(TAU * freq * 3.0 * t)
		buf[start + i] += s * env * vol

func _to_wav(buf: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(buf.size() * 2)
	for i in buf.size():
		data.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 30000.0))
	var st := AudioStreamWAV.new()
	st.format = AudioStreamWAV.FORMAT_16_BITS
	st.mix_rate = RATE
	st.stereo = false
	st.data = data
	if loop:
		st.loop_mode = AudioStreamWAV.LOOP_FORWARD
		st.loop_end = buf.size()
	return st

## Music-box lullaby. tempo scales note length. sparse=true: fewer notes (the idle hum).
func lullaby(vol: float = 0.4, tempo: float = 0.42, loop: bool = false) -> void:
	var key := "lull_%s_%s" % [tempo, loop]
	if not _streams.has(key):
		var note := tempo
		var total := int(RATE * (MOTIF.size() * note + 1.5))
		var buf := PackedFloat32Array()
		buf.resize(total)
		for i in MOTIF.size():
			if MOTIF[i] > 0.0:
				_tone(buf, int(i * note * RATE), MOTIF[i], 1.2, 0.35, true)
		_streams[key] = _to_wav(buf, loop)
	player.stream = _streams[key]
	player.volume_db = linear_to_db(vol)
	player.play()

func stop_music() -> void:
	player.stop()

## Low wind/room drone.
func ambience(level_vol: float = 0.12, cold: bool = true) -> void:
	var key := "amb_%s" % cold
	if not _streams.has(key):
		var buf := PackedFloat32Array()
		var n := RATE * 6
		buf.resize(n)
		var lp := 0.0
		for i in n:
			var t := float(i) / RATE
			lp = lp * 0.995 + (randf() * 2.0 - 1.0) * 0.005
			var wob := 0.5 + 0.5 * sin(TAU * t / 6.0)
			buf[i] = lp * 3.0 * wob + 0.04 * sin(TAU * (55.0 if cold else 82.0) * t)
		# crossfade-free loop point: fade ends
		for i in 2000:
			var f := float(i) / 2000.0
			buf[i] *= f
			buf[n - 1 - i] *= f
		_streams[key] = _to_wav(buf, true)
	amb.stream = _streams[key]
	amb.volume_db = linear_to_db(level_vol)
	amb.play()
