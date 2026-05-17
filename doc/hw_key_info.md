# Hardware Key Info (PDF Digest)

Source files:
- 01 ??6??????????.pdf
- 03 STM32??????.pdf
- STM32??????.pdf

## 1) What Matters For This Project

- Target path is STM32 serial download flow (not ST-Link mandatory).
- Serial adapter in docs is CH340/CH341 family; COM port is dynamic (`COMx`).
- Typical download baudrate shown in docs: `115200`.
- Tool used in STM32 tutorial path: `mcuisp`.
- Download file is HEX (docs also show `OpenArmSTM32.hex`).

## 2) STM32 Download Checklist (Practical)

1. Connect USB serial cable and board power correctly.
2. Open Device Manager, find the port ending with CH340/CH341, note `COMx`.
3. Switch board into download mode (docs mention jumper-cap mode switching + reset if needed).
4. Open `mcuisp`, select the correct `COMx` and `115200`.
5. Load HEX file and start programming.
6. After success, restore run mode (re-plug jumper cap / reset as required).

## 3) Common Failure Cases

- Wrong COM port selected (e.g. accidentally picking system `COM1`).
- Board not in download mode (jumper state not switched correctly).
- Power/reset timing mismatch after mode switch.
- Baudrate mismatch between tool and target.

## 4) Key Evidence Pages (for quick lookup)

### 01 ??6??????????.pdf
- About STM32 setup: page 7
- About STM32 program download: pages 17-23
- CH340 COM-port note and baudrate examples: pages 19-20
- Jumper-cap / reset hints: page 23
- PC software and action-group workflow: pages 30+ and 36+

### 03 STM32??????.pdf
- Wiring / preparation: pages 2-3
- Download steps with `mcuisp`: pages 4-6
- Example project download-and-run flow: pages 9+ / 12+

### STM32??????.pdf
- STM32 board + controller context: pages 1-3

## 5) Mapping To Your Current Real Setup

- Your working serial port: `COM5`
- Your tested chip path: STM32 Bootloader over UART (CH340)
- Your tested flashing result: successful write + verify of `OpenArmSTM32.hex`

Use this replacement rule when reading tutorial screenshots:
- tutorial COM port (e.g. COM3) => your real COM port (COM5)

