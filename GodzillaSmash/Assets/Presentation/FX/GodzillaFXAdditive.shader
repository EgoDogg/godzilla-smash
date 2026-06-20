// Godzilla/FXSoftAdditive — the soft-additive "screen-equivalent" FX blend (plan §8.5, P0-FXSPIKE).
// THE LOAD-BEARING LINE is "Blend OneMinusDstColor One": framebuffer = dst + src*(1-dst), which self-limits
// toward white exactly like Canvas2D 'screen' = 1-(1-s)(1-d) — NOT plain "One One" (= dst+src, which overshoots
// and clamps pale sky/buildings to flat neon white). Per-form tint rides VERTEX COLOR (not a MaterialPropertyBlock,
// which would break the SRP Batcher). rgb is premultiplied by alpha so faint motes read faint and bright cores saturate.
Shader "Godzilla/FXSoftAdditive"
{
    Properties
    {
        _MainTex ("Soft Radial", 2D) = "white" {}
        _Color   ("Tint", Color) = (1,1,1,1)
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" "IgnoreProjector"="True" }

        Pass
        {
            Blend OneMinusDstColor One   // soft-additive screen-equivalent — NOT "One One"
            ZWrite Off
            ZTest Always
            Cull Off

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes { float4 positionOS : POSITION; float2 uv : TEXCOORD0; float4 color : COLOR; };
            struct Varyings  { float4 positionHCS : SV_POSITION; float2 uv : TEXCOORD0; float4 color : COLOR; };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);
            // SRP Batcher: ALL per-material uniforms must live in UnityPerMaterial (texture/sampler stay outside).
            // This is what makes the vertex-color-tint design (correction #14) actually batch — without it the shader
            // is SRP-Batcher INCOMPATIBLE and the whole "no MPB so batching stays on" rationale is moot.
            CBUFFER_START(UnityPerMaterial)
            float4 _Color;
            float4 _MainTex_ST;
            CBUFFER_END

            Varyings vert (Attributes IN)
            {
                Varyings OUT;
                OUT.positionHCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.uv = TRANSFORM_TEX(IN.uv, _MainTex);
                OUT.color = IN.color;
                return OUT;
            }

            half4 frag (Varyings IN) : SV_Target
            {
                half4 tex = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, IN.uv); // soft radial: falloff in .a, white in .rgb
                half  a   = tex.a * IN.color.a * _Color.a;                       // intensity = falloff * vertex alpha * tint alpha
                half3 rgb = tex.rgb * IN.color.rgb * _Color.rgb;                 // per-form tint via vertex color (+ optional material tint)
                return half4(rgb * a, a);                                        // premultiplied emissive
            }
            ENDHLSL
        }
    }
}
