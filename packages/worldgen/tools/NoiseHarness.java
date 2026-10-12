// Runs the game's own noise classes on fixed inputs and prints the results, so the TypeScript
// port can be checked against them value for value. Needs HytaleServer.jar on the class path:
//   java -cp /path/to/HytaleServer.jar tools/NoiseHarness.java > test/fixtures/noise.json
import com.hypixel.hytale.procedurallib.logic.OldSimplexNoise;
import com.hypixel.hytale.procedurallib.logic.SimplexNoise;
import java.util.Random;

public class NoiseHarness {
    public static void main(String[] args) {
        Random r = new Random(12345);
        StringBuilder out = new StringBuilder("{\n");
        out.append("\"simplex2\": [");
        for (int n = 0; n < 600; n++) {
            int seed = r.nextInt(), off = r.nextInt();
            double scale = n % 3 == 0 ? 0.01 : n % 3 == 1 ? 1.0 : 5000.0;
            double x = (r.nextDouble() - 0.5) * 2 * scale * 60, y = (r.nextDouble() - 0.5) * 2 * scale * 60;
            double v = SimplexNoise.INSTANCE.get(seed, off, x, y);
            out.append(n == 0 ? "" : ",").append("\n[").append(seed).append(',').append(off).append(',').append(x).append(',').append(y).append(',').append(v).append(']');
        }
        out.append("\n],\n\"simplex3\": [");
        for (int n = 0; n < 600; n++) {
            int seed = r.nextInt(), off = r.nextInt();
            double scale = n % 3 == 0 ? 0.01 : n % 3 == 1 ? 1.0 : 5000.0;
            double x = (r.nextDouble() - 0.5) * 2 * scale * 60, y = (r.nextDouble() - 0.5) * 2 * scale * 60, z = (r.nextDouble() - 0.5) * 2 * scale * 60;
            double v = SimplexNoise.INSTANCE.get(seed, off, x, y, z);
            out.append(n == 0 ? "" : ",").append("\n[").append(seed).append(',').append(off).append(',').append(x).append(',').append(y).append(',').append(z).append(',').append(v).append(']');
        }
        out.append("\n],\n\"oldSimplex2\": [");
        for (int n = 0; n < 600; n++) {
            int seed = r.nextInt(), off = r.nextInt();
            double scale = n % 3 == 0 ? 0.01 : n % 3 == 1 ? 1.0 : 5000.0;
            double x = (r.nextDouble() - 0.5) * 2 * scale * 60, y = (r.nextDouble() - 0.5) * 2 * scale * 60;
            double v = OldSimplexNoise.INSTANCE.get(seed, off, x, y);
            out.append(n == 0 ? "" : ",").append("\n[").append(seed).append(',').append(off).append(',').append(x).append(',').append(y).append(',').append(v).append(']');
        }
        out.append("\n]\n}\n");
        System.out.print(out);
    }
}
