CC ?= clang
TARGET = wasm32-wasi
CFLAGS = -Oz -Wall -std=c11
LDFLAGS = -Wl,--gc-sections,--strip-all,--export=malloc,--export=free,--allow-undefined

SRC_DIR = wasm
OUTPUT = tcpip.wasm

include $(SRC_DIR)/Filelists.mk
OBJ_FILES = $(SRC_FILES:.c=.o)
INCLUDE = $(SRC_DIR)/include

LWIP_REPO = https://github.com/lwip-tcpip/lwip
LWIP_TAG = STABLE-2_2_0_RELEASE
LWIP_DIR = lwip
LWIP_SRC_DIR = $(LWIP_DIR)/src
LWIP_INCLUDE = $(LWIP_SRC_DIR)/include
LWIP_LIB = $(LWIP_DIR)/liblwip.a
LWIP_STAMP = $(LWIP_DIR)/.stamp

# Only available after cloning the lwIP repository
-include $(LWIP_SRC_DIR)/Filelists.mk

LWIP_SRC_FILES := \
	$(addprefix $(LWIP_SRC_DIR), $(COREFILES)) \
	$(addprefix $(LWIP_SRC_DIR), $(CORE4FILES)) \
	$(addprefix $(LWIP_SRC_DIR), $(NETIFFILES))

LWIP_OBJ_FILES := $(LWIP_SRC_FILES:.c=.o)

.DEFAULT_GOAL := build

%.o: %.c $(INCLUDE)/lwipopts.h | $(LWIP_STAMP)
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(INCLUDE) $(CFLAGS) -c $< -o $@

$(OUTPUT): $(OBJ_FILES) $(LWIP_LIB)
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(INCLUDE) $(LDFLAGS) -o $(OUTPUT) $(OBJ_FILES) $(LWIP_LIB)

$(LWIP_LIB): $(LWIP_STAMP) $(LWIP_OBJ_FILES)
	$(AR) rcs $(LWIP_LIB) $(LWIP_OBJ_FILES)

$(LWIP_STAMP):
	git clone --depth 1 --branch $(LWIP_TAG) $(LWIP_REPO) $(LWIP_DIR)
	touch $(LWIP_STAMP)
	$(MAKE) $(MAKECMDGOALS)

build: $(OUTPUT)

clean:
	rm $(OUTPUT)
	rm $(OBJ_FILES)

clean-vendor:
	rm $(LWIP_OBJ_FILES)

clean-all: clean clean-vendor
	rm -rf $(LWIP_DIR)

.PHONY: build clean clean-vendor clean-all
.SUFFIXES: