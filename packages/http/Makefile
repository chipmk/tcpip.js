CC ?= clang
TARGET = wasm32-wasi
CFLAGS = -Oz -Wall -std=c11
LDFLAGS = -Wl,--gc-sections,--strip-all,--export=malloc,--export=free,--allow-undefined -mexec-model=reactor

LLHTTP_REPO = https://github.com/nodejs/llhttp
LLHTTP_TAG = release/v9.4.1
LLHTTP_DIR = llhttp
LLHTTP_STAMP = $(LLHTTP_DIR)/.stamp
LLHTTP_INCLUDE = $(LLHTTP_DIR)/include
HTTP_PARSER_SRC_FILES = wasm/http_parser.c
LLHTTP_SRC_FILES = \
	$(LLHTTP_DIR)/src/llhttp.c \
	$(LLHTTP_DIR)/src/api.c \
	$(LLHTTP_DIR)/src/http.c

HTTP_PARSER_OBJ_FILES = $(HTTP_PARSER_SRC_FILES:.c=.o)
LLHTTP_OBJ_FILES = $(LLHTTP_SRC_FILES:.c=.o)
LLHTTP_LIB = $(LLHTTP_DIR)/llhttp.a
OUT = http_parser.wasm

.DEFAULT_GOAL := build

wasm/%.o: wasm/%.c | $(LLHTTP_STAMP)
	$(CC) --target=$(TARGET) -I$(LLHTTP_INCLUDE) $(CFLAGS) -c $< -o $@

$(LLHTTP_DIR)/%.o: $(LLHTTP_DIR)/%.c | $(LLHTTP_STAMP)
	$(CC) --target=$(TARGET) -I$(LLHTTP_INCLUDE) $(CFLAGS) -c $< -o $@

$(LLHTTP_STAMP):
	git clone --depth 1 --branch $(LLHTTP_TAG) $(LLHTTP_REPO) $(LLHTTP_DIR)
	touch $(LLHTTP_STAMP)
	$(MAKE) $(MAKECMDGOALS)

$(LLHTTP_LIB): $(LLHTTP_STAMP) $(LLHTTP_OBJ_FILES)
	$(AR) rcs $(LLHTTP_LIB) $(LLHTTP_OBJ_FILES)

$(OUT): $(HTTP_PARSER_OBJ_FILES) $(LLHTTP_LIB)
	$(CC) --target=$(TARGET) $(LDFLAGS) -o $(OUT) $(HTTP_PARSER_OBJ_FILES) $(LLHTTP_LIB)

build: $(OUT)

clean:
	rm -f $(OUT)
	rm -f $(HTTP_PARSER_OBJ_FILES)

clean-vendor:
	rm -f $(LLHTTP_OBJ_FILES)
	rm -f $(LLHTTP_LIB)

clean-all: clean clean-vendor
	rm -rf $(LLHTTP_DIR)

.PHONY: build clean clean-vendor clean-all
