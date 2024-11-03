CC ?= clang
TARGET = wasm32-wasi

SRC_DIR = wasm
OUTPUT = tcpip.wasm

include $(SRC_DIR)/Filelists.mk
OBJ_FILES = $(SRC_FILES:.c=.o)
INCLUDE = $(SRC_DIR)/include
LINKER_FLAGS = -Wl,--export=malloc -Wl,--export=free -Wl,--allow-undefined

LWIP_REPO = https://github.com/lwip-tcpip/lwip
LWIP_TAG = STABLE-2_2_0_RELEASE
LWIP_DIR = lwip
LWIP_SRC_DIR = $(LWIP_DIR)/src
LWIP_INCLUDE = $(LWIP_SRC_DIR)/include
LWIP_LIB = $(LWIP_DIR)/liblwip.a
LWIP_STAMP = $(LWIP_DIR)/.stamp

# Include lwIP source files
include $(LWIP_SRC_DIR)/Filelists.mk

LWIP_SRC_FILES := \
	$(addprefix $(LWIP_SRC_DIR), $(COREFILES)) \
	$(addprefix $(LWIP_SRC_DIR), $(CORE4FILES)) \
	$(addprefix $(LWIP_SRC_DIR), $(NETIFFILES))

LWIP_OBJ_FILES := $(LWIP_SRC_FILES:.c=.o)

.DEFAULT_GOAL := build

%.o: %.c
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(INCLUDE) -c $< -o $@

$(OUTPUT): $(OBJ_FILES) $(LWIP_LIB)
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(INCLUDE) -o $(OUTPUT) $(LINKER_FLAGS) $(OBJ_FILES) $(LWIP_LIB)

$(LWIP_LIB): $(LWIP_STAMP) $(LWIP_OBJ_FILES)
	$(AR) rcs $(LWIP_LIB) $(LWIP_OBJ_FILES)

$(LWIP_STAMP):
	git clone --depth 1 --branch $(LWIP_TAG) $(LWIP_REPO) $(LWIP_DIR)
	touch $(LWIP_STAMP)

build: $(OUTPUT)

clean:
	rm -f $(OUTPUT)

clean-vendor:
	rm -rf $(LWIP_DIR)

.PHONY: build clean clean-vendor
.SUFFIXES: