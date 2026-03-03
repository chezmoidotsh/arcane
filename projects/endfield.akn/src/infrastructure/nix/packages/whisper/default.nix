{ pkgs ? import <nixpkgs> { } }:

let
  models = pkgs.stdenvNoCC.mkDerivation {
    pname = "whisper-models";
    version = "large-v3-turbo";
    dontUnpack = true;
    installPhase = ''
      mkdir -p $out
      install -m 0644 ${pkgs.fetchurl {
        # OpenAI official large-v3-turbo (converted to GGML for whisper.cpp).
        # Optimization: whisper.cpp on aarch64-darwin utilizes the Metal GPU and 
        # CoreML backend, providing inference speeds equivalent to MLX-native 
        # implementations on Apple Silicon.
        url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin";
        sha256 = "sha256-H8cPd0046xaZk6w5Huo1fvR8iHV+9y7llDh5t+jivGk=";
      }} $out/ggml-model.bin
    '';
  };
in
{
  inherit models;
  bin = "${pkgs.whisper-cpp}/bin/whisper-server";
}
