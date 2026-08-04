import torch
from diffusers import CogVideoXPipeline, CogVideoXDPMScheduler
import time
import os

class VideoEngineRuntime:
    def __init__(self, model_id="THUDM/CogVideoX-5b"):
        print(f"Loading Model {model_id} into VRAM...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load the real diffusion pipeline
        self.pipe = CogVideoXPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16
        )
        
        # Scheduler for high quality cinematic output
        self.pipe.scheduler = CogVideoXDPMScheduler.from_config(self.pipe.scheduler.config)
        self.pipe.enable_model_cpu_offload() # VRAM optimization
        self.pipe.vae.enable_tiling() # Memory efficient VAE decoding

    def generate_scene(self, prompt: str, output_path: str, num_frames=49):
        print(f"Generating video on {self.device}. Prompt: {prompt}")
        start_time = time.time()
        
        # Actual Inference Generation
        video = self.pipe(
            prompt=prompt,
            num_frames=num_frames,
            num_inference_steps=50,
            guidance_scale=6.0,
        ).frames[0]
        
        # Export logic using diffusers utility
        from diffusers.utils import export_to_video
        export_to_video(video, output_path, fps=8)
        
        end_time = time.time()
        print(f"Render completed in {end_time - start_time:.2f} seconds.")
        return output_path

if __name__ == "__main__":
    # This is what the BullMQ Worker executes on the GPU Node
    engine = VideoEngineRuntime()
    engine.generate_scene(
        prompt="A cinematic 4K shot of a cyberpunk city with flying cars, highly detailed, photorealistic.",
        output_path="/tmp/ace_render_output.mp4"
    )
