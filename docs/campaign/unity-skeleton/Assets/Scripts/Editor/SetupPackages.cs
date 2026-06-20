using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;

// One-shot headless package setup for the Godzilla→Unity (S3 Hybrid) port.
// Run: Unity -batchmode -quit -executeMethod GodzillaSetup.SetupPackages.Run
namespace GodzillaSetup {
  public static class SetupPackages {
    static readonly string[] Add = new[] {
      "com.unity.render-pipelines.universal", // URP (2D Renderer)
      "com.unity.inputsystem",                // Input System
      "com.unity.cinemachine",                // Cinemachine 3.x
      "com.unity.2d.animation",               // skeletal 2D rigs (the rig pipeline)
      "com.unity.2d.sprite",                  // Sprite Editor
      "com.unity.test-framework",             // NUnit EditMode/PlayMode tests
      "com.unity.2d.tilemap.extras"           // iso tilemap extras
    };
    public static void Run() {
      Debug.Log("[GodzillaSetup] adding " + Add.Length + " packages…");
      var req = Client.AddAndRemove(Add, null);
      while (!req.IsCompleted) System.Threading.Thread.Sleep(150);
      if (req.Status == StatusCode.Failure) {
        Debug.LogError("[GodzillaSetup] FAILED: " + (req.Error != null ? req.Error.message : "?"));
        EditorApplication.Exit(2);
      }
      Debug.Log("[GodzillaSetup] packages resolved OK");
      EditorApplication.Exit(0);
    }
  }
}
