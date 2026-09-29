/**
 * SesliChat — AudioWorklet Pitch Shifter (v2 — Higher Quality)
 *
 * İYİLEŞTİRMELER (v1'e göre):
 * - Cubic (Catmull-Rom) interpolation → linear interpolation yerine
 *   Quantization noise azalır, daha temiz ses
 * - 4 grain 75% overlap (v1'de 2 grain 50% overlap vardı)
 *   Daha smooth crossfade, grain restart discontinuity daha az duyulur
 * - Daha küçük grain size: 1024 samples (23ms @ 44.1kHz)
 *   Voice fundamental (80-300Hz, period 3-12ms) için ideal
 * - Proper window normalization (4 grain toplamı sabit ~1.0)
 *
 * Algoritma: Granular Synthesis with 4-grain overlap-add
 * - Input circular buffer (stereo, 16KB)
 * - 4 grain reader, 75% offset ile (0, 256, 512, 768 samples)
 * - Hann window (grain baş/sonunda smooth fade)
 * - Cubic interpolation ile sample okuma
 * - Grain restart: writeIdx - grainSize
 *
 * Test: pitch=1 → output ≈ input (passthrough)
 *       pitch=2 → bir oktav yukarı
 *       pitch=0.5 → bir oktav aşağı
 */

const BUFFER_SIZE = 16384;     // Circular buffer boyutu
const GRAIN_SIZE = 1024;        // 23ms @ 44.1kHz — voice için ideal
const OVERLAP_COUNT = 4;        // 4 grain → 75% overlap
const GRAIN_STEP = GRAIN_SIZE / OVERLAP_COUNT; // 256 samples offset

class PitchProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [{
            name: 'pitch',
            defaultValue: 1,
            minValue: 0.25,
            maxValue: 4,
            automationRate: 'k-rate'
        }];
    }

    constructor() {
        super();
        // Stereo için 2 ayrı circular buffer
        this.buffers = [
            new Float32Array(BUFFER_SIZE),
            new Float32Array(BUFFER_SIZE)
        ];
        this.writeIdx = 0;

        // 4 grain reader — offset'li başlangıç
        this.readIdxs = [0, 0, 0, 0];
        this.grainPos = [
            0,
            GRAIN_STEP,
            2 * GRAIN_STEP,
            3 * GRAIN_STEP
        ];

        // Hann window
        this.hann = new Float32Array(GRAIN_SIZE);
        for (let i = 0; i < GRAIN_SIZE; i++) {
            this.hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / GRAIN_SIZE);
        }
    }

    /**
     * Cubic (Catmull-Rom) interpolation ile circular buffer'dan oku
     * Linear interpolation'dan çok daha temiz — quantization noise yok
     */
    readSampleCubic(buffer, readIdx) {
        const intPos = Math.floor(readIdx);
        const frac = readIdx - intPos;
        // 4 sample: idx-1, idx, idx+1, idx+2
        const baseIdx = ((intPos % BUFFER_SIZE) + BUFFER_SIZE) % BUFFER_SIZE;
        const idx0 = (baseIdx - 1 + BUFFER_SIZE) % BUFFER_SIZE;
        const idx1 = baseIdx;
        const idx2 = (baseIdx + 1) % BUFFER_SIZE;
        const idx3 = (baseIdx + 2) % BUFFER_SIZE;
        const s0 = buffer[idx0];
        const s1 = buffer[idx1];
        const s2 = buffer[idx2];
        const s3 = buffer[idx3];
        // Catmull-Rom: cubic Bezier
        const frac2 = frac * frac;
        const frac3 = frac2 * frac;
        return 0.5 * (
            (-s0 + 3*s1 - 3*s2 + s3) * frac3 +
            (2*s0 - 5*s1 + 4*s2 - s3) * frac2 +
            (-s0 + s2) * frac +
            2 * s1
        );
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        // Input yok → sessizlik output (ama processor yaşamaya devam)
        if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
            for (let ch = 0; ch < output.length; ch++) {
                if (output[ch]) output[ch].fill(0);
            }
            return true;
        }

        const pitch = parameters.pitch[0];
        const numFrames = output[0].length;
        const numChannels = Math.min(input.length, output.length, 2);

        for (let i = 0; i < numFrames; i++) {
            // 1. Input samples'ı circular buffer'a yaz
            for (let ch = 0; ch < numChannels; ch++) {
                if (input[ch]) {
                    this.buffers[ch][this.writeIdx] = input[ch][i];
                }
            }
            this.writeIdx = (this.writeIdx + 1) % BUFFER_SIZE;

            // 2. Her channel için 4 grain'i topla
            for (let ch = 0; ch < numChannels; ch++) {
                const buf = this.buffers[ch];
                let sum = 0;
                for (let g = 0; g < OVERLAP_COUNT; g++) {
                    // Cubic interpolation ile sample oku
                    const sample = this.readSampleCubic(buf, this.readIdxs[g]);
                    const windowVal = this.hann[Math.floor(this.grainPos[g])];
                    sum += sample * windowVal;
                }
                // Normalization: 4 grain 75% overlap ile Hann window toplamı ~2
                // Bölme 2 → output level input'a yakın
                output[ch][i] = sum / 2;
            }

            // Eğer tek kanal varsa, output 2. kanalı kopyala
            if (numChannels === 1 && output.length > 1 && output[1]) {
                output[1][i] = output[0][i];
            }

            // 3. Pozisyonları ilerlet
            for (let g = 0; g < OVERLAP_COUNT; g++) {
                this.readIdxs[g] += pitch;
                this.grainPos[g] += 1;

                // Wrap readIdxs
                while (this.readIdxs[g] >= BUFFER_SIZE) this.readIdxs[g] -= BUFFER_SIZE;
                while (this.readIdxs[g] < 0) this.readIdxs[g] += BUFFER_SIZE;

                // Grain restart — writeIdx'in gerisine sıfırla
                if (this.grainPos[g] >= GRAIN_SIZE) {
                    this.grainPos[g] = 0;
                    // writeIdx - grainSize pozisyonuna geri dön
                    // (input'un grainSize kadar gerisinde, yani geçmiş)
                    this.readIdxs[g] = (this.writeIdx - GRAIN_SIZE + BUFFER_SIZE) % BUFFER_SIZE;
                }
            }
        }

        return true;
    }
}

registerProcessor('pitch-processor', PitchProcessor);
