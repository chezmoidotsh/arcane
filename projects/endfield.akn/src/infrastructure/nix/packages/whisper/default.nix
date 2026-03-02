{ pkgs ? import <nixpkgs> { } }:

let
  models = pkgs.stdenvNoCC.mkDerivation {
    pname = "whisper-models";
    version = "1.0";
    dontUnpack = true;
    installPhase = ''
      mkdir -p $out
      install -m 0644 ${pkgs.fetchurl {
        url = "https://huggingface.co/bofenghuang/whisper-large-v3-french/resolve/main/ggml-model-q5_0.bin";
        sha256 = "d8da7cb6cdadfac47829abf46fe8cd36fcfef06db5601bfd8acbcd40579010a5";
      }} $out/ggml-model.bin
    '';
  };
in
{
  inherit models;
  bin = "${pkgs.whisper-cpp}/bin/whisper-server";
}
