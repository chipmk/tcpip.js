.SUFFIXES:

CC ?= clang
TARGET = wasm32-wasi
SRC_DIR = wasm
OUTPUT = tcpip.wasm

# Include this lib's source files
include $(SRC_DIR)/Filelists.mk
OBJ_FILES = $(SRC_FILES:.c=.o)

LWIP_REPO = https://github.com/lwip-tcpip/lwip
LWIP_TAG = STABLE-2_2_0_RELEASE
LWIP_DIR = lwip
LWIP_SRC_DIR = $(LWIP_DIR)/src
LWIP_SRC_FILES = $(wildcard $(LWIP_SRC_DIR)/core/*.c)
LWIP_INCLUDE = $(LWIP_SRC_DIR)/include
LWIP_LIB = $(LWIP_DIR)/liblwip.a
LWIP_STAMP = $(LWIP_DIR)/.stamp
LWIP_OPTS_INCLUDE = $(SRC_DIR)/include

# Include lwIP source files
include $(LWIP_SRC_DIR)/Filelists.mk

# Prefix lwIP source files with the lwIP source directory
COREFILES := $(addprefix $(LWIP_SRC_DIR), $(COREFILES))
CORE4FILES := $(addprefix $(LWIP_SRC_DIR), $(CORE4FILES))
NETIFFILES := $(addprefix $(LWIP_SRC_DIR), $(NETIFFILES))

.DEFAULT_GOAL := build

$(OUTPUT): $(OBJ_FILES) $(LWIP_LIB)
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(LWIP_OPTS_INCLUDE) -o $(OUTPUT) -Wl,--export=malloc -Wl,--export=free -Wl,--allow-undefined $(OBJ_FILES) $(LWIP_LIB)

$(SRC_DIR)/%.o: $(SRC_DIR)/%.c
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(LWIP_OPTS_INCLUDE) -c $< -o $@

$(LWIP_LIB): $(LWIP_STAMP)
	$(CC) --target=$(TARGET) -I$(LWIP_INCLUDE) -I$(LWIP_OPTS_INCLUDE) -c $(COREFILES) $(CORE4FILES) $(NETIFFILES)
	$(AR) rcs $(LWIP_LIB) *.o

$(LWIP_STAMP):
	git clone --depth 1 --branch $(LWIP_TAG) $(LWIP_REPO) $(LWIP_DIR)
	touch $(LWIP_STAMP)

build: $(OUTPUT)

clean:
	rm -f $(OUTPUT)

clean-vendor:
	rm -rf $(LWIP_DIR)

.PHONY: build clean clean-vendor
