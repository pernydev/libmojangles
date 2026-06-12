#version 330

#moj_import <minecraft:globals.glsl>
#moj_import <minecraft:fog.glsl>
#moj_import <minecraft:dynamictransforms.glsl>
#moj_import <minecraft:projection.glsl>
#moj_import <minecraft:sample_lightmap.glsl>

in vec3 Position;
in vec4 Color;
in vec2 UV0;
in ivec2 UV2;

uniform sampler2D Sampler2;

out float sphericalVertexDistance;
out float cylindricalVertexDistance;
out vec4 vertexColor;
out vec2 texCoord0;

void main() {
    vec3 pos = Position;
    pos.y += 10.0;

    gl_Position = ProjMat * ModelViewMat * vec4(pos, 1.0);

    sphericalVertexDistance = fog_spherical_distance(Position);
    cylindricalVertexDistance = fog_cylindrical_distance(Position);

    // Color based on screen dimensions
    // Create distinct colors for different screen sizes
    float screenWidth = ScreenSize.x;
    float screenHeight = ScreenSize.y;

    // Map screen dimensions to RGB
    // Red channel: increases with width
    float red = mod(screenWidth / 500.0, 1.0);
    // Green channel: increases with height
    float green = mod(screenHeight / 400.0, 1.0);
    // Blue channel: aspect ratio (width/height)
    float blue = clamp((screenWidth / screenHeight) / 2.0, 0.0, 1.0);

    vertexColor = vec4(red, green, blue, 1.0);
    texCoord0 = UV0;
}
