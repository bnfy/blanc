{
  "targets": [
    {
      "target_name": "glass",
      "conditions": [
        ["OS==\"mac\"", {
          "sources": ["glass.mm"],
          "include_dirs": ["<!@(node -p \"require('node-addon-api').include_dir\")"],
          "libraries": ["-framework AppKit", "-framework QuartzCore"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_CFLAGS": ["-std=c++17", "-Wno-unguarded-availability-new"]
          },
          "defines": ["NAPI_CPP_EXCEPTIONS"]
        }]
      ]
    }
  ]
}
