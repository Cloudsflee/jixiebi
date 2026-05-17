# GCC + Makefile build for STM32F103RB (OpenArmSTM32)

TARGET := OpenArmSTM32_gcc
BUILD_DIR := gcc/build

CC := arm-none-eabi-gcc
AS := arm-none-eabi-gcc
OBJCOPY := arm-none-eabi-objcopy
SIZE := arm-none-eabi-size
STM32_PROG := D:/01_env/STM32_prom/bin/STM32_Programmer_CLI.exe
FLASH_PORT ?= COM5
FLASH_BAUD ?= 115200

CPUFLAGS := -mcpu=cortex-m3 -mthumb
DEFS := -DSTM32F10X_MD -DUSE_STDPERIPH_DRIVER -DHSE_VALUE=8000000UL
INCLUDES := -ICORE -IUSER -ISTM32F10x_FWLib/inc

CSTD := -std=gnu11
WARN := -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers
OPT := -O1
SECT := -ffunction-sections -fdata-sections

CFLAGS := $(CPUFLAGS) $(CSTD) $(DEFS) $(INCLUDES) $(WARN) $(OPT) $(SECT)
ASFLAGS := $(CPUFLAGS) -x assembler-with-cpp $(DEFS) $(INCLUDES)
LDSCRIPT := gcc/linker/STM32F103RB.ld
LDFLAGS := $(CPUFLAGS) -Wl,-Map,$(BUILD_DIR)/$(TARGET).map,--gc-sections -T$(LDSCRIPT) --specs=nano.specs --specs=nosys.specs

# Keep source set close to original Keil map
SRC_C := \
  USER/main.c \
  USER/App.c \
  USER/PWM.c \
  USER/PCMsg.c \
  USER/system_stm32f10x.c \
  USER/RobotRun.c \
  USER/Flash.c \
  USER/PS2GamePad.c \
  USER/Bluetooth.c \
  USER/BusServoCtrl.c \
  USER/syscalls.c \
  USER/stm32f10x_it.c \
  STM32F10x_FWLib/src/misc.c \
  STM32F10x_FWLib/src/stm32f10x_adc.c \
  STM32F10x_FWLib/src/stm32f10x_gpio.c \
  STM32F10x_FWLib/src/stm32f10x_usart.c \
  STM32F10x_FWLib/src/stm32f10x_tim.c \
  STM32F10x_FWLib/src/stm32f10x_spi.c \
  STM32F10x_FWLib/src/stm32f10x_rcc.c

SRC_S := gcc/startup/startup_stm32f103rb.s

OBJ_C := $(patsubst %.c,$(BUILD_DIR)/%.o,$(SRC_C))
OBJ_S := $(patsubst %.s,$(BUILD_DIR)/%.o,$(SRC_S))
OBJS := $(OBJ_C) $(OBJ_S)

ELF := $(BUILD_DIR)/$(TARGET).elf
HEX := $(BUILD_DIR)/$(TARGET).hex
BIN := $(BUILD_DIR)/$(TARGET).bin

.PHONY: all clean size flash

all: $(HEX) $(BIN) size

size: $(ELF)
	$(SIZE) $(ELF)

flash: $(HEX)
	"$(STM32_PROG)" -c port=$(FLASH_PORT) br=$(FLASH_BAUD) -d "$(HEX)" -v

$(HEX): $(ELF)
	$(OBJCOPY) -O ihex $< $@

$(BIN): $(ELF)
	$(OBJCOPY) -O binary $< $@

$(ELF): $(OBJS)
	$(CC) $(OBJS) $(LDFLAGS) -o $@

$(BUILD_DIR)/%.o: %.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

$(BUILD_DIR)/%.o: %.s
	@mkdir -p $(dir $@)
	$(AS) $(ASFLAGS) -c $< -o $@

clean:
	rm -rf $(BUILD_DIR)
